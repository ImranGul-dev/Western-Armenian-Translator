import OpenAI from "openai";

interface ErrorDetails {
  status?: number;
  code?: string;
  type?: string;
  message?: string;
}

export interface OpenAITranslationConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface OpenAITranslationResult {
  translation: string;
  estimatedCost: number | null;
}

export type TranslationDeltaHandler = (delta: string) => void | Promise<void>;

function details(error: unknown): ErrorDetails {
  if (!error || typeof error !== "object") return {};
  const raw = error as Record<string, unknown>;
  const nested = raw.error && typeof raw.error === "object"
    ? raw.error as Record<string, unknown>
    : {};
  return {
    status: typeof raw.status === "number" ? raw.status : undefined,
    code: typeof raw.code === "string" ? raw.code : typeof nested.code === "string" ? nested.code : undefined,
    type: typeof raw.type === "string" ? raw.type : typeof nested.type === "string" ? nested.type : undefined,
    message: typeof raw.message === "string" ? raw.message : undefined,
  };
}

function estimateCost(response: unknown, inputPrice: number, outputPrice: number): number | null {
  if (!inputPrice && !outputPrice) return null;
  const raw = response as { usage?: { input_tokens?: number; output_tokens?: number } | null };
  const input = raw.usage?.input_tokens || 0;
  const output = raw.usage?.output_tokens || 0;
  return Number(((input / 1_000_000) * inputPrice + (output / 1_000_000) * outputPrice).toFixed(6));
}

export function friendlyOpenAIError(error: unknown): { status: number; message: string; code: string } {
  const info = details(error);
  const combined = `${info.code || ""} ${info.type || ""} ${info.message || ""}`.toLowerCase();

  if (error instanceof DOMException && error.name === "AbortError") {
    return { status: 504, message: "The translation took too long. Please try a shorter passage.", code: "timeout" };
  }
  if (info.status === 401 || combined.includes("invalid_api_key")) {
    return { status: 502, message: "The translation service is not configured correctly. Please contact the administrator.", code: "openai_auth_error" };
  }
  if (info.status === 404 || combined.includes("model_not_found")) {
    return { status: 502, message: "The configured translation model is unavailable.", code: "model_unavailable" };
  }
  if (combined.includes("insufficient_quota") || combined.includes("billing") || combined.includes("credit")) {
    return { status: 503, message: "The translation service is temporarily unavailable.", code: "openai_billing_error" };
  }
  if (info.status === 429) {
    return { status: 503, message: "The translation service is temporarily busy. Please wait and try again.", code: "openai_rate_limited" };
  }
  return { status: 502, message: "Translation is temporarily unavailable. Please try again.", code: "openai_error" };
}

function reasoningForModel(model: string): { effort: "none" | "minimal" } | undefined {
  const normalized = model.trim().toLowerCase();

  // GPT-5.4 supports `none`; use it explicitly for the client's latency-
  // sensitive translation workload. This does not change the selected model.
  if (
    normalized === "gpt-5.4" ||
    normalized.startsWith("gpt-5.4-") ||
    normalized === "gpt-5.4-mini" ||
    normalized.startsWith("gpt-5.4-mini-") ||
    normalized === "gpt-5.4-nano" ||
    normalized.startsWith("gpt-5.4-nano-")
  ) {
    return { effort: "none" };
  }

  if (normalized === "gpt-5-mini" || normalized.startsWith("gpt-5-mini-")) {
    return { effort: "minimal" };
  }

  return undefined;
}

function maxOutputTokens(text: string): number {
  // Translation output is normally close to source length. A realistic cap
  // prevents accidental runaway generations while leaving generous headroom.
  const characters = Array.from(text).length;
  return Math.min(8192, Math.max(512, Math.ceil(characters * 2)));
}

function createOpenAIClient(config: OpenAITranslationConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    maxRetries: 0,
    timeout: config.timeoutMs,
  });
}

function requestBody(config: OpenAITranslationConfig, instructions: string, text: string) {
  const reasoning = reasoningForModel(config.model);
  return {
    model: config.model,
    instructions,
    input: [{ role: "user" as const, content: [{ type: "input_text" as const, text }] }],
    max_output_tokens: maxOutputTokens(text),
    ...(reasoning ? { reasoning } : {}),
    store: false,
  };
}

function linkedController(timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromCaller, { once: true });
  }
  return {
    controller,
    cleanup() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromCaller);
    },
  };
}

export async function translateWithOpenAI(
  config: OpenAITranslationConfig,
  instructions: string,
  text: string,
  externalSignal?: AbortSignal,
): Promise<OpenAITranslationResult> {
  const linked = linkedController(config.timeoutMs, externalSignal);
  try {
    const response = await createOpenAIClient(config).responses.create(
      requestBody(config, instructions, text),
      { signal: linked.controller.signal },
    );
    const translation = response.output_text?.trim();
    if (!translation) throw new Error("EMPTY_TRANSLATION");
    return {
      translation,
      estimatedCost: estimateCost(response, config.inputCostPerMillion, config.outputCostPerMillion),
    };
  } finally {
    linked.cleanup();
  }
}

export async function translateWithOpenAIStream(
  config: OpenAITranslationConfig,
  instructions: string,
  text: string,
  onDelta: TranslationDeltaHandler,
  externalSignal?: AbortSignal,
): Promise<OpenAITranslationResult> {
  const linked = linkedController(config.timeoutMs, externalSignal);
  let translation = "";
  let completedResponse: unknown | null = null;

  try {
    const stream = await createOpenAIClient(config).responses.create(
      { ...requestBody(config, instructions, text), stream: true },
      { signal: linked.controller.signal },
    );

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        if (event.delta) {
          translation += event.delta;
          await onDelta(event.delta);
        }
        continue;
      }

      if (event.type === "response.completed") {
        completedResponse = event.response;
        continue;
      }

      if (event.type === "response.failed") {
        const response = event.response as { error?: { code?: string; message?: string } | null };
        const failure = new Error(response.error?.message || "OpenAI response failed.") as Error & { code?: string };
        failure.code = response.error?.code || "response_failed";
        throw failure;
      }

      if (event.type === "response.incomplete") throw new Error("OPENAI_INCOMPLETE_RESPONSE");
    }

    const finalTranslation = translation.trim();
    if (!finalTranslation) throw new Error("EMPTY_TRANSLATION");

    return {
      translation: finalTranslation,
      estimatedCost: estimateCost(completedResponse, config.inputCostPerMillion, config.outputCostPerMillion),
    };
  } finally {
    linked.cleanup();
  }
}
