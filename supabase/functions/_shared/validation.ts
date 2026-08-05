import { isLanguageCode, isSupportedPair } from "./languages.ts";
import type { TranslationRequest } from "./types.ts";

export const ABSOLUTE_MAX_TRANSLATION_CHARACTERS = 10_000;
export const MIN_MEANINGFUL_CHARACTERS = 2;
export const MAX_REQUEST_BYTES = 80_000;

export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}
export function countCharacters(text: string): number { return Array.from(text).length; }
export function countMeaningfulCharacters(text: string): number { return Array.from(text.matchAll(/[\p{L}\p{N}]/gu)).length; }
export function validateTranslationRequest(input: unknown): TranslationRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError("The request body is not valid.");
  const body = input as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.normalize("NFC").replace(/\r\n?/gu, "\n") : "";
  const sourceLanguage = body.sourceLanguage;
  const targetLanguage = body.targetLanguage;
  if (!text.trim()) throw new ValidationError("Please enter text to translate.");
  if (text.includes("\u0000")) throw new ValidationError("The text contains an unsupported control character.");
  if (countCharacters(text) > ABSOLUTE_MAX_TRANSLATION_CHARACTERS) throw new ValidationError(`Text must be ${ABSOLUTE_MAX_TRANSLATION_CHARACTERS.toLocaleString()} characters or fewer.`);
  if (countMeaningfulCharacters(text) < MIN_MEANINGFUL_CHARACTERS) throw new ValidationError("Please enter at least two meaningful characters.");
  if (!isLanguageCode(sourceLanguage) || !isLanguageCode(targetLanguage)) throw new ValidationError("Please choose supported source and target languages.");
  if (!isSupportedPair(sourceLanguage, targetLanguage)) throw new ValidationError("This translation direction is not supported.");
  return { text, sourceLanguage, targetLanguage };
}
