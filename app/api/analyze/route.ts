import { NextRequest, NextResponse } from "next/server";
import {
  analyzeWithDeepSeek,
  DeepSeekRequestError,
  mockAnalyze
} from "@/lib/sentiment";
import { runRequestSecurityChecks, validateAnalyzePayload } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "excel-emotion-ai",
    provider: process.env.DEEPSEEK_API_KEY ? "deepseek" : "mock"
  });
}

export async function POST(request: NextRequest) {
  try {
    const requestSecurity = runRequestSecurityChecks(request);

    if (!requestSecurity.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: requestSecurity.message
        },
        {
          status: requestSecurity.status,
          headers: requestSecurity.headers
        }
      );
    }

    const body = await request.json();
    const validation = validateAnalyzePayload(body);

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: validation.message
        },
        {
          status: validation.status
        }
      );
    }

    const hasDeepSeekKey = Boolean(process.env.DEEPSEEK_API_KEY);
    const results = hasDeepSeekKey
      ? await analyzeWithDeepSeek(validation.items)
      : mockAnalyze(validation.items);

    return NextResponse.json({
      ok: true,
      provider: hasDeepSeekKey ? "deepseek" : "mock",
      results
    }, {
      headers: requestSecurity.headers
    });
  } catch (error) {
    const isDeepSeekError = error instanceof DeepSeekRequestError;
    const message = error instanceof Error ? error.message : "情感分析服务暂时不可用";

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      {
        status: isDeepSeekError ? error.status : 500
      }
    );
  }
}
