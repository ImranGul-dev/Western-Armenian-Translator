import {
  getSupabaseBrowserClient,
} from "@/lib/supabase/client";


export type SystemFeatureToggle =
  | "translation"
  | "audio"
  | "pronunciation"
  | "thesaurus"
  | "role_play"
  | "word_breakdown"
  | "saved_phrases"
  | "vocabulary_decks"
  | "flashcards"
  | "history"
  | "practice_streak"
  | "practice_analytics"
  | "daily_practice"
  | "grammar_tooltips"