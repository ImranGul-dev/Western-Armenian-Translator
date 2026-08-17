import {
  LANGUAGES,
  type LanguageCode,
} from "@/lib/languages";

import {
  getVocabularyDeck,
  type VocabularyDeck,
  type VocabularyDeckPhrase,
} from "@/lib/vocabulary-decks-api";

import {
  transliterateWesternArmenian,
} from "@/lib/western-armenian-transliteration";


const EXPORT_PAGE_SIZE =
  100;


export interface VocabularyDeckExportData {
  deck: VocabularyDeck;
  items: VocabularyDeckPhrase[];
  total: number;
}


function languageName(
  language: LanguageCode,
): string {
  return LANGUAGES[
    language
  ].name;
}


function westernTransliteration(
  text: string,
  language: LanguageCode,
): string {
  if (
    language !== "hyw"
  ) {
    return "";
  }

  return transliterateWesternArmenian(
    text,
  );
}


function exportTransliteration(
  item: VocabularyDeckPhrase,
): string {
  const source =
    westernTransliteration(
      item.sourceText,
      item.sourceLanguage,
    );

  const target =
    westernTransliteration(
      item.translatedText,
      item.targetLanguage,
    );

  if (
    source &&
    target
  ) {
    return `Source: ${source} | Translation: ${target}`;
  }

  return source || target;
}


function safeFilenamePart(
  value: string,
): string {
  const cleaned =
    value
      .normalize("NFC")
      .replace(
        /[<>:"/\\|?*\u0000-\u001F]/gu,
        " ",
      )
      .replace(
        /\s+/gu,
        " ",
      )
      .trim()
      .replace(
        /[. ]+$/gu,
        "",
      )
      .slice(
        0,
        80,
      );

  return cleaned ||
    "vocabulary-deck";
}


function csvCell(
  value: string,
): string {
  const normalized =
    value.replace(
      /\u0000/gu,
      "",
    );

  const spreadsheetSafe =
    /^[=+\-@]/u.test(
      normalized,
    )
      ? `\t${normalized}`
      : normalized;

  return `"${spreadsheetSafe.replace(
    /"/gu,
    '""',
  )}"`;
}


function isoDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toISOString();
}


function humanDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",
    },
  ).format(date);
}


function escapeHtml(
  value: string,
): string {
  return value.replace(
    /[&<>"']/gu,
    (character) => {
      switch (character) {
        case "&":
          return "&amp;";

        case "<":
          return "&lt;";

        case ">":
          return "&gt;";

        case '"':
          return "&quot;";

        case "'":
          return "&#39;";

        default:
          return character;
      }
    },
  );
}


export async function loadVocabularyDeckExportData(
  accessToken: string,
  deckId: string,
): Promise<VocabularyDeckExportData> {
  const firstPage =
    await getVocabularyDeck(
      accessToken,
      deckId,
      {
        limit:
          EXPORT_PAGE_SIZE,

        offset:
          0,
      },
    );

  const items = [
    ...firstPage.items,
  ];

  let offset =
    firstPage.items.length;

  while (
    items.length <
      firstPage.total
  ) {
    const page =
      await getVocabularyDeck(
        accessToken,
        deckId,
        {
          limit:
            EXPORT_PAGE_SIZE,

          offset,
        },
      );

    if (
      page.items.length ===
        0
    ) {
      break;
    }

    items.push(
      ...page.items,
    );

    offset +=
      page.items.length;
  }

  return {
    deck:
      firstPage.deck,

    items,

    total:
      items.length,
  };
}


export function downloadVocabularyDeckCsv(
  data: VocabularyDeckExportData,
): void {
  const rows: string[][] = [
    [
      "Source Text",
      "Source Language",
      "Translation",
      "Target Language",
      "Western Armenian Transliteration",
      "Favourite",
      "Added to Deck At",
    ],
    ...data.items.map(
      (item) => [
        item.sourceText,
        item.sourceLanguage,
        item.translatedText,
        item.targetLanguage,
        exportTransliteration(
          item,
        ),
        item.isFavorite
          ? "Yes"
          : "No",
        isoDate(
          item.addedAt,
        ),
      ],
    ),
  ];

  const csv =
    `\uFEFF${rows
      .map(
        (row) =>
          row
            .map(csvCell)
            .join(","),
      )
      .join("\r\n")}`;

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8",
      },
    );

  const objectUrl =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      "a",
    );

  anchor.href =
    objectUrl;

  anchor.download =
    `${safeFilenamePart(
      data.deck.name,
    )}-vocabulary-deck.csv`;

  anchor.style.display =
    "none";

  document.body.appendChild(
    anchor,
  );

  anchor.click();
  anchor.remove();

  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        objectUrl,
      );
    },
    1000,
  );
}


export function openVocabularyDeckPdfWindow(): Window | null {
  const printWindow =
    window.open(
      "",
      "_blank",
    );

  if (!printWindow) {
    return null;
  }

  printWindow.opener =
    null;

  printWindow.document.open();
  printWindow.document.write(
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>Preparing Vocabulary Deck PDF</title></head><body style=\"font-family:system-ui,sans-serif;padding:32px\">Preparing printable Vocabulary Deck...</body></html>",
  );
  printWindow.document.close();

  return printWindow;
}


export function renderVocabularyDeckPdf(
  printWindow: Window,
  data: VocabularyDeckExportData,
): void {
  const generatedAt =
    new Intl.DateTimeFormat(
      undefined,
      {
        dateStyle:
          "medium",

        timeStyle:
          "short",
      },
    ).format(
      new Date(),
    );

  const phraseMarkup =
    data.items.length
      ? data.items
          .map(
            (
              item,
              index,
            ) => {
              const sourceTransliteration =
                westernTransliteration(
                  item.sourceText,
                  item.sourceLanguage,
                );

              const targetTransliteration =
                westernTransliteration(
                  item.translatedText,
                  item.targetLanguage,
                );

              const favourite =
                item.isFavorite
                  ? '<span class="favourite">Favourite</span>'
                  : "";

              return `
                <section class="phrase">
                  <div class="phrase-topline">
                    <strong>Phrase ${index + 1}</strong>
                    ${favourite}
                  </div>
                  <div class="phrase-grid">
                    <div class="phrase-column">
                      <div class="label">Source · ${escapeHtml(
                        languageName(
                          item.sourceLanguage,
                        ),
                      )}</div>
                      <div class="main-text">${escapeHtml(
                        item.sourceText,
                      )}</div>
                      ${
                        sourceTransliteration
                          ? `<div class="transliteration">${escapeHtml(
                              sourceTransliteration,
                            )}</div>`
                          : ""
                      }
                    </div>
                    <div class="phrase-column translation-column">
                      <div class="label">Translation · ${escapeHtml(
                        languageName(
                          item.targetLanguage,
                        ),
                      )}</div>
                      <div class="main-text">${escapeHtml(
                        item.translatedText,
                      )}</div>
                      ${
                        targetTransliteration
                          ? `<div class="transliteration">${escapeHtml(
                              targetTransliteration,
                            )}</div>`
                          : ""
                      }
                    </div>
                  </div>
                  <div class="phrase-meta">Added to deck ${escapeHtml(
                    humanDate(
                      item.addedAt,
                    ),
                  )}</div>
                </section>
              `;
            },
          )
          .join("")
      : '<div class="empty">This Vocabulary Deck does not contain any Saved Phrases.</div>';

  const description =
    data.deck.description
      ? `<p class="description">${escapeHtml(
          data.deck.description,
        )}</p>`
      : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(
    data.deck.name,
  )} - Vocabulary Deck</title>
  <style>
    @page {
      size: A4;
      margin: 14mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #172033;
      background: #ffffff;
      font-family: "Segoe UI", "Noto Sans Armenian", "Noto Sans", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
    }

    .sheet-header {
      padding-bottom: 14px;
      border-bottom: 2px solid #d9dee8;
    }

    .product {
      margin: 0 0 5px;
      color: #536078;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      color: #111827;
      font-size: 22pt;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .description {
      margin: 8px 0 0;
      color: #465268;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 18px;
      margin-top: 10px;
      color: #5d687c;
      font-size: 9pt;
    }

    .phrases {
      margin-top: 16px;
    }

    .phrase {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid #dfe4ec;
      border-radius: 8px;
      overflow: hidden;
    }

    .phrase + .phrase {
      margin-top: 12px;
    }

    .phrase-topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 7px 10px;
      background: #f5f7fa;
      color: #596579;
      font-size: 8.5pt;
    }

    .favourite {
      color: #8a5b00;
      font-weight: 700;
    }

    .phrase-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .phrase-column {
      min-width: 0;
      padding: 11px 12px;
    }

    .translation-column {
      border-left: 1px solid #e4e8ef;
      background: #fbfcfe;
    }

    .label {
      margin-bottom: 6px;
      color: #69758a;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .main-text {
      color: #172033;
      font-size: 12pt;
      font-weight: 600;
      line-height: 1.55;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .transliteration {
      margin-top: 6px;
      color: #667085;
      font-size: 9.5pt;
      font-style: italic;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .phrase-meta {
      padding: 6px 10px;
      border-top: 1px solid #e4e8ef;
      color: #788397;
      font-size: 7.8pt;
    }

    .empty {
      padding: 28px;
      border: 1px dashed #cfd6e1;
      border-radius: 8px;
      color: #657086;
      text-align: center;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
    }

    @media screen and (max-width: 720px) {
      .phrase-grid {
        grid-template-columns: 1fr;
      }

      .translation-column {
        border-top: 1px solid #e4e8ef;
        border-left: 0;
      }
    }
  </style>
</head>
<body>
  <header class="sheet-header">
    <p class="product">Tun Western Armenian · Vocabulary Deck Study Sheet</p>
    <h1>${escapeHtml(
      data.deck.name,
    )}</h1>
    ${description}
    <div class="summary">
      <span>${data.total.toLocaleString()} ${
        data.total === 1
          ? "phrase"
          : "phrases"
      }</span>
      <span>Exported ${escapeHtml(
        generatedAt,
      )}</span>
    </div>
  </header>
  <main class="phrases">
    ${phraseMarkup}
  </main>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(
    html,
  );
  printWindow.document.close();

  const print = () => {
    if (
      printWindow.closed
    ) {
      return;
    }

    printWindow.focus();
    printWindow.print();
  };

  if (
    printWindow.document.fonts
  ) {
    void printWindow.document.fonts.ready
      .then(
        () => {
          printWindow.setTimeout(
            print,
            50,
          );
        },
      );
  } else {
    printWindow.setTimeout(
      print,
      100,
    );
  }
}
