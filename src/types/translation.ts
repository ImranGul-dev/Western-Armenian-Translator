import type { LanguageCode } from "@/lib/languages";
import type { UsageSummary } from "@/types/database";

export interface GuestUsage {
  used: number;
  limit: number;
  remaining: number;
  period: "day";
}

export interface TranslationRequest {
  text: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}

export interface TranslationSuccessResponse {
  success: true;
  translation: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  characterCount: number;
  requestId: string;
  usage?: UsageSummary;
  guestUsage?: GuestUsage | null;
  historySaved?: boolean;
}

export interface TranslationErrorResponse {
  success: false;
  error: string;
  requestId?: string;
  code?: string;
  upgradeRecommended?: boolean;
  guestUsage?: GuestUsage;
}

export type TranslationResponse =
  | TranslationSuccessResponse
  | TranslationErrorResponse;