import type { AnalyzeItem, SentimentLabel, SentimentResult } from "@/lib/types";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT_MS = 30000;

const positiveWords = [
  "不错",
  "舒服",
  "喜欢",
  "心动",
  "种草",
  "期待",
  "推荐",
  "满意",
  "开心",
  "值得",
  "方便",
  "优秀",
  "很好",
  "漂亮"
];

const negativeWords = [
  "失望",
  "糟糕",
  "差",
  "贵",
  "麻烦",
  "投诉",
  "难受",
  "讨厌",
  "不满",
  "踩雷",
  "坑",
  "不好",
  "焦虑",
  "无语"
];

type DeepSeekMessage = {
  content?: string;
};

type DeepSeekChoice = {
  finish_reason?: string | null;
  message?: DeepSeekMessage;
};

type DeepSeekResponse = {
  choices?: DeepSeekChoice[];
};

type ParsedSentimentPayload =
  | {
      results?: Array<Partial<SentimentResult>>;
      result?: Array<Partial<SentimentResult>>;
    }
  | Array<Partial<SentimentResult>>;

export class DeepSeekRequestError extends Error {
  constructor(
    message: string,
    readonly status = 502
  ) {
    super(message);
    this.name = "DeepSeekRequestError";
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sentimentFromScore(score: number): SentimentLabel {
  if (score <= 4) return "负面";
  if (score >= 6) return "正面";
  return "中立";
}

function normalizeConfidence(value: unknown) {
  const numericValue = Number(value ?? 0.7);

  if (!Number.isFinite(numericValue)) return 0.7;
  if (numericValue > 1 && numericValue <= 100) {
    return clamp(numericValue / 100, 0, 1);
  }

  return clamp(numericValue, 0, 1);
}

function normalizeResult(
  item: AnalyzeItem,
  result: Partial<SentimentResult> | undefined
): SentimentResult {
  const score = clamp(Math.round(Number(result?.score ?? 5)), 0, 10);

  return {
    id: item.id,
    score,
    sentiment: sentimentFromScore(score),
    confidence: normalizeConfidence(result?.confidence)
  };
}

function scoreText(text: string) {
  const positiveHits = positiveWords.filter((word) => text.includes(word)).length;
  const negativeHits = negativeWords.filter((word) => text.includes(word)).length;
  const delta = positiveHits - negativeHits;

  if (delta > 0) {
    return {
      score: clamp(6 + delta, 6, 10),
      confidence: clamp(0.62 + delta * 0.08, 0.62, 0.9)
    };
  }

  if (delta < 0) {
    return {
      score: clamp(4 + delta, 0, 4),
      confidence: clamp(0.62 + Math.abs(delta) * 0.08, 0.62, 0.9)
    };
  }

  return {
    score: 5,
    confidence: 0.55
  };
}

export function mockAnalyze(items: AnalyzeItem[]): SentimentResult[] {
  return items.map((item) => {
    const scored = scoreText(item.text);

    return {
      id: item.id,
      score: scored.score,
      sentiment: sentimentFromScore(scored.score),
      confidence: scored.confidence
    };
  });
}

function buildPrompt(items: AnalyzeItem[]) {
  return [
    "你是一个中文评论情感分析模型。",
    "请分析每条评论的情感倾向，并返回严格 JSON。",
    "评分规则：0-4 为负面，5 为中立客观，6-10 为正面积极。",
    "置信度 confidence 必须是 0 到 1 的小数。",
    "必须返回 JSON，不要输出 Markdown，不要解释，不要省略任何评论。",
    "JSON 格式：{\"results\":[{\"id\":\"原序号\",\"score\":8,\"sentiment\":\"正面\",\"confidence\":0.92}]}",
    `评论列表：${JSON.stringify(items)}`
  ].join("\n");
}

function sanitizeErrorText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

function messageForDeepSeekStatus(status: number, errorText: string) {
  if (status === 400) return "DeepSeek 请求参数不合法，请检查模型名和请求格式";
  if (status === 401) return "DeepSeek API Key 无效或未授权";
  if (status === 402) return "DeepSeek 账户余额不足";
  if (status === 429) return "DeepSeek 请求过于频繁，请稍后重试";
  if (status >= 500) return "DeepSeek 服务暂时不可用，请稍后重试";

  const detail = sanitizeErrorText(errorText);
  return detail ? `DeepSeek 调用失败：${status} ${detail}` : `DeepSeek 调用失败：${status}`;
}

function stripJsonFences(value: string) {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function parseJsonPayload(content: string): ParsedSentimentPayload {
  const normalized = stripJsonFences(content);

  try {
    return JSON.parse(normalized) as ParsedSentimentPayload;
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1)) as ParsedSentimentPayload;
    }

    throw new DeepSeekRequestError("DeepSeek 返回内容不是有效 JSON");
  }
}

function extractResults(payload: ParsedSentimentPayload) {
  if (Array.isArray(payload)) return payload;
  return payload.results ?? payload.result ?? [];
}

async function parseDeepSeekError(response: Response) {
  const text = await response.text();
  throw new DeepSeekRequestError(
    messageForDeepSeekStatus(response.status, text),
    502
  );
}

export async function analyzeWithDeepSeek(
  items: AnalyzeItem[],
  apiKeyOverride?: string
): Promise<SentimentResult[]> {
  const apiKey = apiKeyOverride || process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new DeepSeekRequestError(
        "请先输入 DeepSeek API Key，或在 Vercel 配置 DEEPSEEK_API_KEY",
        401
      );
    }

    return mockAnalyze(items);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    numberFromEnv("DEEPSEEK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)
  );

  let response: Response;

  try {
    response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
        messages: [
          {
            role: "system",
            content:
              "你负责把中文评论映射为结构化情感分析结果，必须遵守用户给定的评分规则，且只输出 JSON。"
          },
          {
            role: "user",
            content: buildPrompt(items)
          }
        ],
        response_format: {
          type: "json_object"
        },
        temperature: 0,
        max_tokens: 2000,
        thinking: {
          type: "disabled"
        }
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new DeepSeekRequestError("DeepSeek 请求超时，请稍后重试");
    }

    throw new DeepSeekRequestError("DeepSeek 网络请求失败");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    await parseDeepSeekError(response);
  }

  const data = (await response.json()) as DeepSeekResponse;
  const choice = data.choices?.[0];
  const content = choice?.message?.content;

  if (choice?.finish_reason === "length") {
    throw new DeepSeekRequestError("DeepSeek 输出被截断，请减小批次大小后重试");
  }

  if (!content) {
    throw new DeepSeekRequestError("DeepSeek 未返回分析结果");
  }

  const parsed = parseJsonPayload(content);
  const results = extractResults(parsed);
  const resultMap = new Map(
    results.map((result) => [String(result.id), result])
  );

  return items.map((item) => normalizeResult(item, resultMap.get(String(item.id))));
}
