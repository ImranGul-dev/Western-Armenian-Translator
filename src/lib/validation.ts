export const MAX_TRANSLATION_CHARACTERS = 10_000;
export const MIN_MEANINGFUL_CHARACTERS = 2;
export function countMeaningfulCharacters(text: string): number {
  return Array.from(text.normalize("NFC").matchAll(/[\p{L}\p{N}]/gu)).length;
}
