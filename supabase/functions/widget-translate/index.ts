import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { currentCharacters, planFromEffective, resolveEffectivePlan } from "../_shared/account.ts";
import { getRuntimeConfig } from "../_shared/env.ts";
import { findRelevantContext } from "../_shared/knowledge-base.ts";
import { friendlyOpenAIError, translateWithOpenAI } from "../_shared/openai-translation.ts";
import { consumeRateLimit } from "../_shared/rate-limit.ts";
import { isPublishableKeyAccepted, sha256Hex } from "../_shared/security.ts";
import { buildTranslationInstructions } from "../_shared/translation-prompt.ts";
import { countCharacters, MAX_REQUEST_BYTES, validateTranslationRequest, ValidationError } from "../_shared/validation.ts";
import { originMatchesDomain } from "../_shared/widget-domain.ts";
import type { LanguageCode, PlanConfig } from "../_shared/types.ts";

interface WidgetSiteRow {
  id: string;
  user_id: string;
  name: string;
  allowed_domain: string;
  public_key: string;
  active: boolean;
  deleted_at: string | null;
  show_branding: boolean;
  theme: "light" | "dark" | "auto";
  default_source_language: LanguageCode;
  default_target_language: LanguageCode;
}

interface WidgetAccess {
  site: WidgetSiteRow;
  plan: PlanConfig;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-Id",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
}

function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

async function recordEvent(
  admin: SupabaseClient,
  access: WidgetAccess,
  values: {
    requestId: string;
    origin: string;
    source?: LanguageCode;
    target?: LanguageCode;
    characters?: number;
    status: string;
    success: boolean;
    processed: boolean;
    latency: number;
    errorCode?: string;
  }
) {
  await admin.from("widget_usage_events").insert({
    request_id: values.requestId,
    widget_site_id: access.site.id,
    user_id: access.site.user_id,
    origin: values.origin,
    source_language: values.source || null,
    target_language: values.target || null,
    character_count: values.characters || 0,
    status: values.status,
    success: values.success,
    openai_processed: values.processed,
    latency_ms: values.latency,
    error_code: values.errorCode || null
  });
}

async function loadWidgetAccess(admin: SupabaseClient, publicKey: string, origin: string): Promise<WidgetAccess | { error: string; code: string; status: number; site?: WidgetSiteRow }> {
  if (!/^wpk_[a-f0-9]{48}$/u.test(publicKey)) return { error: "This widget key is invalid.", code: "invalid_widget_key", status: 403 };
  const { data, error } = await admin
    .from("widget_sites")
    .select("id,user_id,name,allowed_domain,public_key,active,deleted_at,show_branding,theme,default_source_language,default_target_language")
    .eq("public_key", publicKey)
    .maybeSingle();
  if (error || !data) return { error: "This widget key is invalid or has been rotated.", code: "invalid_widget_key", status: 403 };
  const site = data as WidgetSiteRow;
  if (site.deleted_at) return { error: "This widget installation no longer exists.", code: "widget_deleted", status: 403, site };
  if (!originMatchesDomain(origin, site.allowed_domain)) return { error: "This widget is not authorized for the current website domain.", code: "invalid_origin", status: 403, site };
  if (!site.active) return { error: "This widget installation is disabled.", code: "widget_disabled", status: 403, site };

  const plan = await resolveEffectivePlan(admin, site.user_id);
  if (!plan.widgetEnabled || plan.widgetSiteLimit < 1) return { error: "The widget owner’s current plan does not include widget access.", code: "plan_not_eligible", status: 403, site };

  const { data: allowedSites } = await admin
    .from("widget_sites")
    .select("id")
    .eq("user_id", site.user_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(plan.widgetSiteLimit);
  if (!(allowedSites || []).some((item: { id: string }) => item.id === site.id)) {
    return { error: "This widget exceeds the owner’s current site allowance.", code: "widget_site_limit", status: 403, site };
  }
  return { site, plan };
}

async function separateWidgetCharacters(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin.rpc("widget_monthly_characters_for_user", { p_user_id: userId });
  if (error) throw new Error("WIDGET_USAGE_UNAVAILABLE");
  return Number(data || 0);
}

async function incrementSharedUsage(admin: SupabaseClient, access: WidgetAccess, characters: number) {
  await admin.rpc("increment_monthly_usage", {
    p_identity_key: `user:${access.site.user_id}`,
    p_user_id: access.site.user_id,
    p_plan_id: access.plan.id,
    p_plan_slug: access.plan.slug,
    p_characters: characters,
    p_success: true
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const config = getRuntimeConfig();
    const origin = request.headers.get("origin");
    const publicKey = new URL(request.url).searchParams.get("widget_key") || "";

    if (!origin) return json({ success: false, error: "A website Origin header is required.", code: "missing_origin", requestId }, 403, { "X-Request-Id": requestId });
    if (!config.supabaseUrl || !config.adminKey || !config.openAiApiKey || !config.rateLimitSalt) return json({ success: false, error: "The widget translation service is not configured.", code: "configuration_error", requestId }, 500, { "X-Request-Id": requestId });

    const admin = createClient(config.supabaseUrl, config.adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const accessResult = await loadWidgetAccess(admin, publicKey, origin);
    if ("error" in accessResult) {
      const validatedOrigin = accessResult.site && originMatchesDomain(origin, accessResult.site.allowed_domain);
      const errorHeaders = validatedOrigin ? { ...corsHeaders(origin), "X-Request-Id": requestId } : { "X-Request-Id": requestId };
      if (accessResult.site && (request.method !== "OPTIONS" || !validatedOrigin)) {
        await recordEvent(admin, { site: accessResult.site, plan: planFromEffective(null) }, { requestId, origin, status: accessResult.code, success: false, processed: false, latency: Date.now() - started, errorCode: accessResult.code });
      }
      if (request.method === "OPTIONS" && validatedOrigin) return new Response(null, { status: 204, headers: errorHeaders });
      return json({ success: false, error: accessResult.error, code: accessResult.code, requestId }, accessResult.status, errorHeaders);
    }
    const access = accessResult;
    const cors = { ...corsHeaders(origin), "X-Request-Id": requestId };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!isPublishableKeyAccepted(request.headers.get("apikey"), config.publishableKeys)) return json({ success: false, error: "The public Supabase key is missing or invalid.", code: "invalid_publishable_key", requestId }, 401, cors);
    if (request.method === "GET") {
      return json({
        success: true,
        requestId,
        config: {
          theme: access.site.theme,
          sourceLanguage: access.site.default_source_language,
          targetLanguage: access.site.default_target_language,
          showBranding: access.site.show_branding
        }
      }, 200, cors);
    }
    if (request.method !== "POST") return json({ success: false, error: "Only GET and POST requests are supported.", requestId }, 405, { ...cors, Allow: "GET, POST, OPTIONS" });
    if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) return json({ success: false, error: "Send the request as JSON.", requestId }, 415, cors);
    const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return json({ success: false, error: "The translation request is too large.", requestId }, 413, cors);

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      await recordEvent(admin, access, { requestId, origin, status: "invalid_json", success: false, processed: false, latency: Date.now() - started, errorCode: "invalid_json" });
      return json({ success: false, error: "The request contains invalid JSON.", code: "invalid_json", requestId }, 400, cors);
    }

    let payload;
    try {
      payload = validateTranslationRequest(raw);
    } catch (error) {
      const message = error instanceof ValidationError ? error.message : "The translation request is not valid.";
      await recordEvent(admin, access, { requestId, origin, status: "invalid_request", success: false, processed: false, latency: Date.now() - started, errorCode: "invalid_request" });
      return json({ success: false, error: message, code: "invalid_request", requestId }, 400, cors);
    }

    const characters = countCharacters(payload.text);
    if (characters > access.plan.maxCharactersPerRequest) {
      await recordEvent(admin, access, { requestId, origin, source: payload.sourceLanguage, target: payload.targetLanguage, characters, status: "request_limit", success: false, processed: false, latency: Date.now() - started, errorCode: "request_limit" });
      return json({ success: false, error: `This widget accepts up to ${access.plan.maxCharactersPerRequest.toLocaleString()} characters per request.`, code: "request_limit", requestId }, 413, cors);
    }

    const allowance = access.plan.widgetMonthlyCharacterLimit ?? access.plan.monthlyCharacterLimit;
    let used: number;
    try {
      used = access.plan.widgetMonthlyCharacterLimit === null
        ? await currentCharacters(admin, `user:${access.site.user_id}`)
        : await separateWidgetCharacters(admin, access.site.user_id);
    } catch {
      return json({ success: false, error: "Usage metering is temporarily unavailable. Please try again.", code: "usage_unavailable", requestId }, 503, cors);
    }
    if (used + characters > allowance) {
      await recordEvent(admin, access, { requestId, origin, source: payload.sourceLanguage, target: payload.targetLanguage, characters, status: "monthly_limit", success: false, processed: false, latency: Date.now() - started, errorCode: "monthly_limit" });
      return json({ success: false, error: "This widget has reached its monthly character allowance.", code: "monthly_limit", requestId }, 429, cors);
    }

    const rateIdentifier = await sha256Hex(`${config.rateLimitSalt}|widget|${access.site.public_key}|${origin}`);
    let rate;
    try {
      rate = await consumeRateLimit(admin, rateIdentifier, access.plan.rateLimitPerMinute, 60);
    } catch {
      return json({ success: false, error: "The translation service is temporarily unavailable.", code: "rate_limit_unavailable", requestId }, 503, cors);
    }
    const rateHeaders = { ...cors, "X-RateLimit-Limit": String(access.plan.rateLimitPerMinute), "X-RateLimit-Remaining": String(rate.remaining), "X-RateLimit-Reset": rate.resetAt };
    if (!rate.allowed) {
      await recordEvent(admin, access, { requestId, origin, source: payload.sourceLanguage, target: payload.targetLanguage, characters, status: "rate_limit", success: false, processed: false, latency: Date.now() - started, errorCode: "rate_limit" });
      return json({ success: false, error: "Too many translation requests. Please wait a moment and try again.", code: "rate_limit", requestId }, 429, { ...rateHeaders, "Retry-After": "60" });
    }

    const context = await findRelevantContext(admin, payload.text, payload.sourceLanguage, payload.targetLanguage);
    const instructions = buildTranslationInstructions(payload.sourceLanguage, payload.targetLanguage, context);
    try {
      const result = await translateWithOpenAI({
        apiKey: config.openAiApiKey,
        model: config.openAiModel,
        timeoutMs: config.openAiTimeoutMs,
        inputCostPerMillion: config.inputCostPerMillion,
        outputCostPerMillion: config.outputCostPerMillion
      }, instructions, payload.text);

      await recordEvent(admin, access, { requestId, origin, source: payload.sourceLanguage, target: payload.targetLanguage, characters, status: "success", success: true, processed: true, latency: Date.now() - started });
      if (access.plan.widgetMonthlyCharacterLimit === null) await incrementSharedUsage(admin, access, characters);
      await Promise.all([
        admin.from("widget_sites").update({ last_used_at: new Date().toISOString() }).eq("id", access.site.id),
        admin.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", access.site.user_id)
      ]);
      return json({
        success: true,
        translation: result.translation,
        sourceLanguage: payload.sourceLanguage,
        targetLanguage: payload.targetLanguage,
        characterCount: characters,
        requestId,
        usage: { used: used + characters, limit: allowance, remaining: Math.max(0, allowance - used - characters) },
        showBranding: access.site.show_branding
      }, 200, rateHeaders);
    } catch (error) {
      const friendly = friendlyOpenAIError(error);
      await recordEvent(admin, access, { requestId, origin, source: payload.sourceLanguage, target: payload.targetLanguage, characters, status: friendly.code, success: false, processed: false, latency: Date.now() - started, errorCode: friendly.code });
      await admin.from("system_errors").insert({ request_id: requestId, error_code: friendly.code, safe_message: friendly.message, function_name: "widget-translate" });
      return json({ success: false, error: friendly.message, code: friendly.code, requestId }, friendly.status, rateHeaders);
    }
  }
};
