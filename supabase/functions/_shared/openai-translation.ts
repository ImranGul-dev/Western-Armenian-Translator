import OpenAI from "openai";

interface ErrorDetails {
  status?: number;
  code?: string;
  type?: string;
  message?: string;
}

export interface OpenAITranslationConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface OpenAITranslationResult {
  translation: string;
  estimatedCost: number | null;
}

function details(error: unknown): ErrorDetails {
  if (!error || typeof error !== "object") {
    return {};
  }

  const raw = error as Record<string, unknown>;

  const nested =
    raw.error && typeof raw.error === "object"
      ? (raw.error as Record<string, unknown>)
      : {};

  return {
    status:
      typeof raw.status === "number"
        ? raw.status
        : undefined,

    code:
      typeof raw.code === "string"
        ? raw.code
        : typeof nested.code === "string"
          ? nested.code
          : undefined,

    type:
      typeof raw.type === "string"
        ? raw.type
        : typeof nested.type === "string"
          ? nested.type
          : undefined,

    message:
      typeof raw.message === "string"
        ? raw.message
        : undefined,
  };
}

function estimateCost(
  response: unknown,
  inputPrice: number,
  outputPrice: number,
): number | null {
  if (!inputPrice && !outputPrice) {
    return null;
  }

  const raw = response as {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
    };
  };

  const input = raw.usage?.input_tokens || 0;
  const output = raw.usage?.output_tokens || 0;

  return Number(
    (
      (input / 1_000_000) * inputPrice +
      (output / 1_000_000) * outputPrice
    ).toFixed(6),
  );
}

export function friendlyOpenAIError(
  error: unknown,
): {
  status: number;
  message: string;
  code: string;
} {
  const info = details(error);

  const combined =
    `${info.code || ""} ${info.type || ""} ${info.message || ""}`.toLowerCase();

  if (
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return {
      status: 504,
      message:
        "The translation took too long. Please try a shorter passage.",
      code: "timeout",
    };
  }

  if (
    info.status === 401 ||
    combined.includes("invalid_api_key")
  ) {
    return {
      status: 502,
      message:
        "The translation service is not configured correctly. Please contact the administrator.",
      code: "openai_auth_error",
    };
  }

  if (
    info.status === 404 ||
    combined.includes("model_not_found")
  ) {
    return {
      status: 502,
      message:
        "The configured translation model is unavailable.",
      code: "model_unavailable",
    };
  }

  if (
    combined.includes("insufficient_quota") ||
    combined.includes("billing") ||
    combined.includes("credit")
  ) {
    return {
      status: 503,
      message:
        "The translation service is temporarily unavailable.",
      code: "openai_billing_error",
    };
  }

  if (info.status === 429) {
    return {
      status: 503,
      message:
        "The translation service is temporarily busy. Please wait and try again.",
      code: "openai_rate_limited",
    };
  }

  return {
    status: 502,
    message:
      "Translation is temporarily unavailable. Please try again.",
    code: "openai_error",
  };
}

function reasoningForModel(
  model: string,
): { effort: "minimal" } | undefined {
  const normalized = model
    .trim()
    .toLowerCase();

  /*
   * The current production/default translation model is
   * gpt-5-mini. Translation is a constrained task, so use
   * minimal reasoning to reduce latency while retaining the
   * same model.
   *
   * Do not automatically apply this setting to arbitrary
   * future model names because supported reasoning options
   * can differ between model families.
   */
  if (
    normalized === "gpt-5-mini" ||
    normalized.startsWith("gpt-5-mini-")
  ) {
    return {
      effort: "minimal",
    };
  }

  return undefined;
}

export async function translateWithOpenAI(
  config: OpenAITranslationConfig,
  instructions: string,
  text: string,
): Promise<OpenAITranslationResult> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    config.timeoutMs,
  );

  try {
    /*
     * Disable SDK-level automatic retries.
     *
     * The translation endpoint already has its own safe
     * error handling and frontend retry flow. Avoiding
     * hidden retries prevents one request from silently
     * turning into several long OpenAI requests.
     */
    const openai = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: 0,
      timeout: config.timeoutMs,
    });

    const reasoning =
      reasoningForModel(config.model);

    const response =
      await openai.responses.create(
        {
          model: config.model,

          instructions,

          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text,
                },
              ],
            },
          ],

          /*
           * Keep the existing maximum for now. We will
           * optimize prompt size separately so long
           * translations are not accidentally truncated.
           */
          max_output_tokens: 8192,

          /*
           * GPT-5 mini defaults to more reasoning than a
           * straightforward translation normally needs.
           * Minimal reasoning materially reduces unnecessary
           * generation work.
           */
          ...(reasoning
            ? {
                reasoning,
              }
            : {}),

          /*
           * Translation content must not be stored by OpenAI.
           */
          store: false,
        },
        {
          signal: controller.signal,
        },
      );

    const translation =
      response.output_text?.trim();

    if (!translation) {
      throw new Error("EMPTY_TRANSLATION");
    }

    return {
      translation,

      estimatedCost: estimateCost(
        response,
        config.inputCostPerMillion,
        config.outputCostPerMillion,
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}