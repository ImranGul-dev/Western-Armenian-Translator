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


function mapRow(
  row: GrammarTooltipRow,
): GrammarTooltip {
  return {
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
  };
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
  ).map(mapRow);
}


export async function loadGrammarTooltipsForTarget(
  text: string,
  targetLanguage: LanguageCode,
  limit = 8,
): Promise<GrammarTooltip[]> {
  if (!text.trim()) {
    return [];
  }

  const sourceLanguages:
    LanguageCode[] =
      targetLanguage === "hyw"
        ? ["en", "hye"]
        : targetLanguage === "en"
          ? ["hyw"]
          : [];

  if (!sourceLanguages.length) {
    return [];
  }

  const results =
    await Promise.all(
      sourceLanguages.map(
        (sourceLanguage) =>
          loadGrammarTooltips(
            text,
            sourceLanguage,
            targetLanguage,
            limit,
          ),
      ),
    );

  const seen =
    new Set<string>();

  return results
    .flat()
    .sort(
      (left, right) =>
        left.priority -
          right.priority ||
        right.matchedTrigger.length -
          left.matchedTrigger.length ||
        left.title.localeCompare(
          right.title,
        ),
    )
    .filter((tooltip) => {
      const key =
        [
          tooltip.title,
          tooltip.explanation,
          tooltip.matchedTrigger,
        ].join("\0");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
