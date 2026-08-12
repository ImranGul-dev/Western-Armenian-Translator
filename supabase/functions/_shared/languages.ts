import { LANGUAGE_CODES, type LanguageCode } from "./types.ts";

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: "English",
  hyw: "Western Armenian",
  hye: "Eastern Armenian",
};

const SUPPORTED_PAIRS = new Set([
  "en:hyw",
  "hyw:en",
  "hye:hyw",
  "en:hye",
  "hye:en",
]);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGE_CODES.includes(value as LanguageCode);
}

export function isSupportedPair(source: LanguageCode, target: LanguageCode): boolean {
  return SUPPORTED_PAIRS.has(`${source}:${target}`);
}
