import {
  getSupabaseBrowserClient,
} from "@/lib/supabase/client";

import type {
  LanguageCode,
} from "@/lib/languages";


export interface GrammarTooltip {
  ruleId: string;
  title: string;
  explanation: string;
  example: string;
  ruleCategory: string | null;
  matchedTrigger: string;
  priority: number;
}


interface GrammarTooltipRow {
  rule_id: string;
  title: string;
  explanation: string;
  example: string;
  rule_category: string | null;
  matched_trigger: string;
  priority: number;
}


export async function loadGrammarTooltips(
  text: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  limit = 8,
): Promise<GrammarTooltip[]> {
  if (!text.trim()) {
    return [];
  }

  const {
    data,
    error,
  } = await getSupabaseBrowserClient()
    .rpc(
      "find_grammar_tooltips",
      {
        p_text:
          text,
        p_source_language:
          sourceLanguage,
        p_target_language:
          targetLanguage,
        p_limit:
          limit,
      },
    );

  if (error) {
    throw new Error(
      error.message ||
        "Grammar tips could not be loaded.",
    );
  }

  return (
    (
      data ??
      []
    ) as GrammarTooltipRow[]
  ).map(
    (row) => ({
      ruleId:
        row.rule_id,
      title:
        row.title,
      explanation:
        row.explanation,
      example:
        row.example,
      ruleCategory:
        row.rule_category,
      matchedTrigger:
        row.matched_trigger,
      priority:
        Number(
          row.priority ??
            100,
        ),
    }),
  );
}
