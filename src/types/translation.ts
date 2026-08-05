import type { LanguageCode } from "@/lib/languages";
import type { UsageSummary } from "@/types/database";

export interface TranslationRequest { text: string; sourceLanguage: LanguageCode; targetLanguage: LanguageCode; }
export interface TranslationSuccessResponse {
  success: true; translation: string; sourceLanguage: LanguageCode; targetLanguage: LanguageCode;
  characterCount: number; requestId: string; usage?: UsageSummary; historySaved?: boolean;
}
export interface TranslationErrorResponse { success: false; error: string; requestId?: string; code?: string; upgradeRecommended?: boolean; }
export type TranslationResponse = TranslationSuccessResponse | TranslationErrorResponse;
