export const LANGUAGE_CODES = ["en", "hyw", "hye"] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export interface LanguageDefinition {
  code: LanguageCode;
  name: string;
  nativeName: string;
  direction: "ltr";
}

export const LANGUAGES: Record<LanguageCode, LanguageDefinition> = {
  en: { code: "en", name: "English", nativeName: "English", direction: "ltr" },
  hyw: { code: "hyw", name: "Western Armenian", nativeName: "Արեւմտահայերէն", direction: "ltr" },
  hye: { code: "hye", name: "Eastern Armenian", nativeName: "Արևելահայերեն", direction: "ltr" }
};

export const SUPPORTED_LANGUAGE_PAIRS = [
  { source: "en", target: "hyw" },
  { source: "hyw", target: "en" },
  { source: "hye", target: "hyw" }
] as const satisfies ReadonlyArray<{ source: LanguageCode; target: LanguageCode }>;

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGE_CODES.includes(value as LanguageCode);
}

export function isSupportedPair(source: LanguageCode, target: LanguageCode): boolean {
  return SUPPORTED_LANGUAGE_PAIRS.some((pair) => pair.source === source && pair.target === target);
}

export function canSwapLanguages(source: LanguageCode, target: LanguageCode): boolean {
  return isSupportedPair(target, source);
}

export function getTargetsForSource(source: LanguageCode): LanguageCode[] {
  return SUPPORTED_LANGUAGE_PAIRS.filter((pair) => pair.source === source).map((pair) => pair.target);
}

export function getSourcesForTarget(target: LanguageCode): LanguageCode[] {
  return SUPPORTED_LANGUAGE_PAIRS.filter((pair) => pair.target === target).map((pair) => pair.source);
}
