import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  LanguageCode,
  TranslationContext,
} from "./types.ts";

const EMPTY: TranslationContext = {
  glossary: [],
  grammarRules: [],
  approvedExamples: [],
};

/*
 * Keep translation context intentionally small.
 *
 * Relevant approved terminology is still included, but we avoid
 * sending a large language-reference packet with every request.
 */
const SHORT_TEXT_THRESHOLD = 120;

const SHORT_TEXT_LIMITS = {
  glossary: 6,
  examples: 2,
  rules: 2,
};

const NORMAL_TEXT_LIMITS = {
  glossary: 8,
  examples: 3,
  rules: 3,
};

const MAX_CONTEXT_JSON_CHARACTERS = 9_000;

function arr<T>(value: unknown): T[] {
  return Array.isArray(value)
    ? (value as T[])
    : [];
}

function limitsForText(text: string) {
  const meaningfulLength = Array.from(
    text.trim(),
  ).length;

  return meaningfulLength <= SHORT_TEXT_THRESHOLD
    ? SHORT_TEXT_LIMITS
    : NORMAL_TEXT_LIMITS;
}

export async function findRelevantContext(
  admin: SupabaseClient,
  text: string,
  source: LanguageCode,
  target: LanguageCode,
): Promise<TranslationContext> {
  const limits = limitsForText(text);

  const { data, error } = await admin.rpc(
    "find_translation_context",
    {
      p_text: text,
      p_source_language: source,
      p_target_language: target,
      p_glossary_limit: limits.glossary,
      p_example_limit: limits.examples,
      p_rule_limit: limits.rules,
    },
  );

  /*
   * Context is supplemental. A temporary knowledge-base lookup
   * problem should not stop translation completely.
   */
  if (
    error ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    return EMPTY;
  }

  const result = data as Record<
    string,
    unknown
  >;

  const context: TranslationContext = {
    glossary: arr(result.glossary),
    grammarRules: arr(result.grammarRules),
    approvedExamples: arr(
      result.approvedExamples,
    ),
  };

  /*
   * Defensive protection against an unexpectedly large database
   * response. The translation prompt has its own cap too, but
   * keeping the payload small here saves processing before the
   * OpenAI request is constructed.
   */
  if (
    JSON.stringify(context).length >
    MAX_CONTEXT_JSON_CHARACTERS
  ) {
    return {
      glossary: context.glossary.slice(0, 6),
      grammarRules:
        context.grammarRules.slice(0, 2),
      approvedExamples:
        context.approvedExamples.slice(0, 2),
    };
  }

  return context;
}