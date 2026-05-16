import type { NextRequest } from "next/server";
import type { AnalyzeItem } from "@/lib/types";

type ValidationResult =
  | {
      ok: true;
      items: AnalyzeItem[];
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type RequestSecurityResult =
  | {
      ok: true;
      headers?: Record<string, string>;
    }
  | {
      ok: false;
      status: number;
      message: string;
      headers?: Record<string, string>;
    };

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitGlobal = typeof globalThis & {
  __excelEmotionRateLimits?: Map<string, RateLimitBucket>;
};

const DEFAULT_ACCESS_CODE = "demo2026";
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 30;

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const MAX_ITEMS_PER_REQUEST = numberFromEnv(
  "MAX_ITEMS_PER_REQUEST",
  20
);
export const MAX_TEXT_LENGTH = numberFromEnv("MAX_TEXT_LENGTH", 500);
export const RATE_LIMIT_WINDOW_MS = numberFromEnv(
  "RATE_LIMIT_WINDOW_MS",
  DEFAULT_RATE_LIMIT_WINDOW_MS
);
export const RATE_LIMIT_MAX_REQUESTS = numberFromEnv(
  "RATE_LIMIT_MAX_REQUESTS",
  DEFAULT_RATE_LIMIT_MAX_REQUESTS
);

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function hasValidAccessCode(value: unknown) {
  const expected = process.env.ACCESS_CODE || DEFAULT_ACCESS_CODE;
  return normalizeText(value) === expected;
}

function parseAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function parseOrigin(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function isPrivateIpv4Host(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isLocalRequest(requestUrl: URL) {
  return process.env.NODE_ENV !== "production" || isLoopbackHost(requestUrl.hostname);
}

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) return true;

  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  const allowedOrigins = parseAllowedOrigins();

  if (origin === requestOrigin) return true;
  if (allowedOrigins.includes("*")) return true;
  if (origin === "null" && isLocalRequest(requestUrl)) return true;

  const originUrl = parseOrigin(origin);

  if (
    originUrl &&
    (isLoopbackHost(originUrl.hostname) ||
      isPrivateIpv4Host(originUrl.hostname)) &&
    isLocalRequest(requestUrl)
  ) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    forwardedIp ||
    "unknown"
  );
}

function getRateLimitStore() {
  const rateLimitGlobal = globalThis as RateLimitGlobal;

  if (!rateLimitGlobal.__excelEmotionRateLimits) {
    rateLimitGlobal.__excelEmotionRateLimits = new Map();
  }

  return rateLimitGlobal.__excelEmotionRateLimits;
}

function cleanupExpiredBuckets(store: Map<string, RateLimitBucket>, now: number) {
  if (store.size < 1000) return;

  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
}

function checkRateLimit(request: NextRequest): RequestSecurityResult {
  const now = Date.now();
  const store = getRateLimitStore();
  const key = getClientIp(request);
  const existing = store.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + RATE_LIMIT_WINDOW_MS
        };

  cleanupExpiredBuckets(store, now);
  bucket.count += 1;
  store.set(key, bucket);

  const remaining = Math.max(RATE_LIMIT_MAX_REQUESTS - bucket.count, 0);
  const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
  const headers = {
    "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000))
  };

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    return {
      ok: false,
      status: 429,
      message: `请求过于频繁，请 ${retryAfterSeconds} 秒后重试`,
      headers: {
        ...headers,
        "Retry-After": String(retryAfterSeconds)
      }
    };
  }

  return {
    ok: true,
    headers
  };
}

export function runRequestSecurityChecks(
  request: NextRequest
): RequestSecurityResult {
  if (!isAllowedOrigin(request)) {
    return {
      ok: false,
      status: 403,
      message: "请求来源不被允许"
    };
  }

  return checkRateLimit(request);
}

export function validateAnalyzePayload(body: unknown): ValidationResult {
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      status: 400,
      message: "请求内容为空"
    };
  }

  const payload = body as {
    accessCode?: unknown;
    items?: unknown;
  };

  if (!hasValidAccessCode(payload.accessCode)) {
    return {
      ok: false,
      status: 401,
      message: "访问码不正确"
    };
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return {
      ok: false,
      status: 400,
      message: "评论列表为空"
    };
  }

  if (payload.items.length > MAX_ITEMS_PER_REQUEST) {
    return {
      ok: false,
      status: 413,
      message: `单次最多分析 ${MAX_ITEMS_PER_REQUEST} 条评论`
    };
  }

  const items: AnalyzeItem[] = [];

  for (const item of payload.items) {
    if (!item || typeof item !== "object") {
      return {
        ok: false,
        status: 400,
        message: "评论格式不正确"
      };
    }

    const current = item as {
      id?: unknown;
      text?: unknown;
    };
    const text = normalizeText(current.text);

    if (!text) {
      return {
        ok: false,
        status: 400,
        message: "评论文本不能为空"
      };
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return {
        ok: false,
        status: 413,
        message: `单条评论最多 ${MAX_TEXT_LENGTH} 字`
      };
    }

    items.push({
      id: typeof current.id === "number" ? current.id : normalizeText(current.id),
      text
    });
  }

  return {
    ok: true,
    items
  };
}
