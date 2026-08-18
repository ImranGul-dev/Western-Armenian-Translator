const LETTERS: Record<string, string> = {
  ա: "a",
  բ: "p",
  գ: "k",
  դ: "t",
  ե: "e",
  զ: "z",
  է: "e",
  ը: "ë",
  թ: "t'",
  ժ: "zh",
  ի: "i",
  լ: "l",
  խ: "kh",
  ծ: "dz",
  կ: "g",
  հ: "h",
  ձ: "ts",
  ղ: "gh",
  ճ: "j",
  մ: "m",
  յ: "y",
  ն: "n",
  շ: "sh",
  ո: "o",
  չ: "ch'",
  պ: "b",
  ջ: "ch",
  ռ: "r",
  ս: "s",
  վ: "v",
  տ: "d",
  ր: "r",
  ց: "ts'",
  ւ: "v",
  փ: "p'",
  ք: "k'",
  օ: "o",
  ֆ: "f",
};

function isArmenianLetter(value: string): boolean {
  return /[\u0531-\u0556\u0561-\u0586]/u.test(value);
}

function isUppercaseArmenian(value: string): boolean {
  return /[\u0531-\u0556]/u.test(value);
}

function lowerArmenian(value: string): string {
  return value.toLocaleLowerCase("hy-AM");
}

function preserveCase(source: string, latin: string): string {
  if (!isUppercaseArmenian(source) || !latin) return latin;
  return latin[0].toUpperCase() + latin.slice(1);
}

function endsSentence(value: string): boolean {
  return /[.!?\u055C\u055E\u0589\n\r]/u.test(value);
}

/**
 * Readable pronunciation-oriented Latin transliteration for Western Armenian.
 * It intentionally follows Western Armenian consonant values (for example
 * կ -> g and կը -> gë) rather than Eastern Armenian pronunciation.
 *
 * Pronunciation notes requested for learner output:
 * - ես -> "yes" only when it is the first word of a sentence; otherwise "es".
 * - ե -> "ye" at the beginning of an ordinary word and "e" elsewhere.
 * - ո -> "vo" at the beginning of a word and "o" elsewhere.
 */
export function transliterateWesternArmenian(value: string): string {
  const input = Array.from(value.normalize("NFC"));
  let output = "";
  let previousWasArmenian = false;
  let atSentenceStart = true;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const lower = lowerArmenian(current);
    const next = input[index + 1] ?? "";
    const nextLower = lowerArmenian(next);
    const afterNext = input[index + 2] ?? "";
    const wordStart = !previousWasArmenian;

    // Special pronunciation rule for ես. Unlike ordinary initial ե, the word
    // is "yes" only at sentence start and "es" elsewhere in the sentence.
    if (
      wordStart &&
      lower === "ե" &&
      nextLower === "ս" &&
      !isArmenianLetter(afterNext)
    ) {
      output += preserveCase(
        current,
        atSentenceStart
          ? "yes"
          : "es",
      );

      index += 1;
      previousWasArmenian = true;
      atSentenceStart = false;
      continue;
    }

    // Classical/Western Armenian digraphs.
    if (lower === "ո" && nextLower === "ւ") {
      output += preserveCase(current, "u");
      index += 1;
      previousWasArmenian = true;
      atSentenceStart = false;
      continue;
    }

    if (lower === "ե" && nextLower === "ւ") {
      output += preserveCase(current, wordStart ? "yev" : "ev");
      index += 1;
      previousWasArmenian = true;
      atSentenceStart = false;
      continue;
    }

    // Reformed ligature may occasionally appear in imported text.
    if (lower === "և") {
      output += preserveCase(current, wordStart ? "yev" : "ev");
      previousWasArmenian = true;
      atSentenceStart = false;
      continue;
    }

    if (!isArmenianLetter(current)) {
      output += current;
      previousWasArmenian = false;

      if (endsSentence(current)) {
        atSentenceStart = true;
      }

      continue;
    }

    if (lower === "ե") {
      output += preserveCase(current, wordStart ? "ye" : "e");
      previousWasArmenian = true;
      atSentenceStart = false;
      continue;
    }

    if (lower === "ո") {
      output += preserveCase(current, wordStart ? "vo" : "o");
      previousWasArmenian = true;
      atSentenceStart = false;
      continue;
    }

    output += preserveCase(current, LETTERS[lower] ?? current);
    previousWasArmenian = true;
    atSentenceStart = false;
  }

  return output;
}
