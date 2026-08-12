import type { SupabaseClient } from "@supabase/supabase-js";
import type { LanguageCode, TranslationContext } from "./types.ts";

const EMPTY: TranslationContext = {
  glossary: [],
  grammarRules: [],
  approvedExamples: [],
  exactTranslation: null,
};

const VERY_SHORT_TEXT_THRESHOLD = 80;
const NORMAL_TEXT_THRESHOLD = 600;
const MAX_CONTEXT_JSON_CHARACTERS = 7_000;

const VERY_SHORT_LIMITS = { glossary: 4, examples: 1, rules: 1 };
const NORMAL_LIMITS = { glossary: 6, examples: 2, rules: 2 };
const LONG_LIMITS = { glossary: 8, examples: 3, rules: 3 };

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function limitsForText(text: string) {
  const length = Array.from(text.trim()).length;
  if (length <= VERY_SHORT_TEXT_THRESHOLD) return VERY_SHORT_LIMITS;
  if (length <= NORMAL_TEXT_THRESHOLD) return NORMAL_LIMITS;
  return LONG_LIMITS;
}

function normalizeExact(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("hy-AM");
}

export async function findRelevantContext(
  admin: SupabaseClient,
  text: string,
  source: LanguageCode,
  target: LanguageCode,
): Promise<TranslationContext> {
  const limits = limitsForText(text);
  const { data, error } = await admin.rpc("find_translation_context", {
    p_text: text,
    p_source_language: source,
    p_target_language: target,
    p_glossary_limit: limits.glossary,
    p_example_limit: limits.examples,
    p_rule_limit: limits.rules,
  });

  if (error || !data || typeof data !== "object" || Array.isArray(data)) return EMPTY;

  const result = data as Record<string, unknown>;
  const approvedExamples = arr<TranslationContext["approvedExamples"][number]>(result.approvedExamples);
  const normalizedSource = normalizeExact(text);
  const exact = approvedExamples.find((example) => normalizeExact(example.sourceText) === normalizedSource);

  const context: TranslationContext = {
    glossary: arr(result.glossary),
    grammarRules: arr(result.grammarRules),
    approvedExamples,
    exactTranslation: exact?.targetText ?? null,
  };

  if (JSON.stringify(context).length > MAX_CONTEXT_JSON_CHARACTERS) {
    return {
      glossary: context.glossary.slice(0, 5),
      grammarRules: context.grammarRules.slice(0, 2),
      approvedExamples: context.approvedExamples.slice(0, 2),
      exactTranslation: context.exactTranslation,
    };
  }

  return context;
}
