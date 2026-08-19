export const LANGUAGE_CODES = ["en", "hyw", "hye"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];
export type AccountRole = "anonymous" | "user" | "language_editor" | "admin";
export type PlanSource = "anonymous" | "default" | "stripe" | "woocommerce" | "manual" | "admin";

export interface TranslationRequest {
  text: string;
  sourceLanguage: LanguageCode;
  targetLanguage: LanguageCode;
}

export interface GlossaryContextItem {
  sourceTerm: string;
  targetTerm: string;
  partOfSpeech: string | null;
  definition?: string | null;
  notes: string | null;
  sourceName?: string | null;
}

export interface GrammarContextItem {
  title: string;
  description: string;
  correctExamples?: unknown[];
  incorrectExamples?: unknown[];
  exceptions?: unknown[];
  notes?: string | null;
}

export interface ExampleContextItem {
  sourceText: string;
  targetText: string;
  category: string | null;
  notes?: string | null;
  sourceName?: string | null;
}

export interface TranslationContext {
  glossary: GlossaryContextItem[];
  grammarRules: GrammarContextItem[];
  approvedExamples: ExampleContextItem[];
  exactTranslation?: string | null;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string;
}

export interface PlanConfig {
  id: string | null;
  slug: "free" | "premium" | "business" | "admin" | "anonymous";
  name: string;
  source: PlanSource;
  monthlyCharacterLimit: number;
  maxCharactersPerRequest: number;
  historyLimit: number | null;
  rateLimitPerMinute: number;
  widgetEnabled: boolean;
  widgetSiteLimit: number;
  widgetMonthlyCharacterLimit: number | null;
  widgetBrandingRemovable: boolean;
  overrideExpiresAt: string | null;
  stripeStatus: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

export interface AccountContext {
  userId: string | null;
  role: AccountRole;
  historyEnabled: boolean;
  queryReviewConsent: boolean;
  identityKey: string;
  plan: PlanConfig;
}
