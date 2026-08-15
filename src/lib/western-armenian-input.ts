const LATIN_TO_ARMENIAN:
  Readonly<Record<string, string>> = {
  // Classical Western Armenian letter combinations.
  "ch'": "չ",
  "ts'": "ց",
  "t'": "թ",
  "p'": "փ",
  "k'": "ք",

  // Common ASCII alternatives.
  "ch’": "չ",
  "ts’": "ց",
  "t’": "թ",
  "p’": "փ",
  "k’": "ք",

  // Multi-letter sounds.
  yev: "եւ",
  ev: "եւ",
  ew: "եւ",
  zh: "ժ",
  kh: "խ",
  dz: "ծ",
  gh: "ղ",
  sh: "շ",
  ch: "ջ",
  ts: "ձ",
  rr: "ռ",
  jh: "ջ",
  ye: "ե",
  vo: "ո",
  oo: "օ",
  ee: "է",

  // Single-letter Western Armenian phonetic input.
  a: "ա",
  p: "բ",
  k: "գ",
  t: "դ",
  e: "ե",
  z: "զ",
  ë: "ը",
  ə: "ը",
  i: "ի",
  l: "լ",
  x: "խ",
  g: "կ",
  h: "հ",
  j: "ճ",
  m: "մ",
  y: "յ",
  n: "ն",
  o: "ո",
  b: "պ",
  s: "ս",
  v: "վ",
  d: "տ",
  r: "ր",
  w: "ւ",
  f: "ֆ",

  // Armenian digraph vowel.
  u: "ու",

  // Accented alternatives.
  ē: "է",
  ō: "օ",
};

const MATCH_KEYS =
  Object.keys(
    LATIN_TO_ARMENIAN,
  ).sort(
    (left, right) =>
      right.length -
      left.length,
  );

const LATIN_INPUT_PATTERN =
  /[A-Za-z\u00CB\u00EB\u0112\u0113\u014C\u014D\u0259]/u;

function armenianUppercase(
  value: string,
): string {
  return value.toLocaleUpperCase(
    "hy-AM",
  );
}

function latinLettersOnly(
  value: string,
): string {
  return value.replace(
    /[^A-Za-z\u00CB\u00EB\u0112\u0113\u014C\u014D\u0259]/gu,
    "",
  );
}

function applySourceCase(
  source: string,
  armenian: string,
): string {
  const letters =
    latinLettersOnly(source);

  if (!letters) {
    return armenian;
  }

  const uppercase =
    letters ===
    letters.toLocaleUpperCase(
      "en-US",
    );

  if (uppercase) {
    return armenianUppercase(
      armenian,
    );
  }

  const first =
    Array.from(letters)[0] ??
    "";

  if (
    first &&
    first ===
      first.toLocaleUpperCase(
        "en-US",
      ) &&
    first !==
      first.toLocaleLowerCase(
        "en-US",
      )
  ) {
    const characters =
      Array.from(armenian);

    if (characters.length > 0) {
      characters[0] =
        armenianUppercase(
          characters[0],
        );
    }

    return characters.join("");
  }

  return armenian;
}

function normalizedForMatch(
  value: string,
): string {
  return value
    .normalize("NFC")
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .toLocaleLowerCase(
      "en-US",
    );
}

/**
 * Returns true when the value contains Latin characters that can be
 * converted to Western Armenian script.
 */
export function hasLatinWesternArmenianInput(
  value: string,
): boolean {
  return LATIN_INPUT_PATTERN.test(
    value,
  );
}

/**
 * Converts phonetic Latin input into Western Armenian script.
 *
 * This is intentionally separate from
 * transliterateWesternArmenian(), which performs the opposite
 * Armenian -> Latin reading conversion.
 *
 * Existing Armenian script, whitespace, numbers and punctuation
 * are preserved. Unknown Latin characters are also preserved
 * rather than guessed.
 */
export function latinToWesternArmenian(
  value: string,
): string {
  const input =
    value.normalize("NFC");

  let output = "";
  let index = 0;

  while (index < input.length) {
    const remaining =
      input.slice(index);

    let matched = false;

    for (
      const key of MATCH_KEYS
    ) {
      const candidate =
        remaining.slice(
          0,
          key.length,
        );

      if (
        normalizedForMatch(
          candidate,
        ) !== key
      ) {
        continue;
      }

      const armenian =
        LATIN_TO_ARMENIAN[
          key
        ];

      output +=
        applySourceCase(
          candidate,
          armenian,
        );

      index +=
        candidate.length;

      matched = true;
      break;
    }

    if (matched) {
      continue;
    }

    output += input[index];
    index += 1;
  }

  return output;
}