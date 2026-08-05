import type { TranslationRequest, TranslationResponse, TranslationSuccessResponse } from "@/types/translation";
import { getSupabaseConfig } from "@/lib/supabase/client";

const CLIENT_ID_STORAGE_KEY = "wat-anonymous-client-id";
function createClientId(): string { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function getClientId(): string {
  if (typeof window === "undefined") return createClientId();
  try { const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY); if (existing) return existing; const id=createClientId(); localStorage.setItem(CLIENT_ID_STORAGE_KEY,id); return id; } catch { return createClientId(); }
}
function getFunctionUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_TRANSLATION_FUNCTION_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/u, "");
  const { url } = getSupabaseConfig();
  if (!url) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL to .env.local.");
  return `${url}/functions/v1/translate`;
}
export async function requestTranslation(payload: TranslationRequest, signal: AbortSignal, accessToken?: string | null): Promise<TranslationSuccessResponse> {
  const { key } = getSupabaseConfig();
  if (!key) throw new Error("Supabase is not configured. Add the publishable key to .env.local.");
  const headers: Record<string,string> = { "Content-Type":"application/json", apikey:key, "x-client-id":getClientId() };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(getFunctionUrl(), { method:"POST", headers, body:JSON.stringify(payload), cache:"no-store", signal });
  let data: TranslationResponse;
  try { data = await response.json() as TranslationResponse; } catch { throw new Error("The translation service returned an invalid response."); }
  if (!response.ok || !data.success) {
    const message = data.success ? "Translation failed. Please try again." : data.error;
    const error = new Error(message) as Error & { code?: string; upgradeRecommended?: boolean };
    if (!data.success) { error.code = data.code; error.upgradeRecommended = data.upgradeRecommended; }
    throw error;
  }
  return data;
}
