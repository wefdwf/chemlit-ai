import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import {
  MAIN_PROMPT,
  OVERVIEW_PROMPT,
  STRUCTURE_PROMPT,
  TERMS_PROMPT,
} from "@/lib/prompts";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

// Prompt 版本号：改 prompt 后手动 +1，旧缓存自动失效
const PROMPT_VERSION = "v13";

type AnalysisType = "main" | "overview" | "structure" | "terms";

// 服务端内存缓存：相同输入 → 相同结果
const resultCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_MAX_SIZE = 500; // 最多缓存 500 条，防止内存溢出

async function callDeepSeek(systemContent: string, userContent: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000); // 60s 超时

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        temperature: 0,
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { paperText, type, userQuestion, selectedSubject, force } = await request.json();

    if (!paperText || !type) {
      return NextResponse.json(
        { error: "缺少论文文本或分析类型" },
        { status: 400 }
      );
    }

    if (paperText.length > 100000) {
      return NextResponse.json(
        { error: "论文过长，请限制在 30 页以内" },
        { status: 400 }
      );
    }

    const prompts: Record<AnalysisType, string> = {
      main: MAIN_PROMPT,
      overview: OVERVIEW_PROMPT,
      structure: STRUCTURE_PROMPT,
      terms: TERMS_PROMPT,
    };

    const prompt = prompts[type as AnalysisType];
    if (!prompt) {
      return NextResponse.json(
        { error: "不支持的分析类型，可选: main, overview, structure, terms" },
        { status: 400 }
      );
    }

    // 构建缓存 key：hash(论文 + 问题 + 方向 + 类型 + prompt版本)
    const cacheKey = createHash("sha256")
      .update(paperText)
      .update(userQuestion || "")
      .update(selectedSubject || "")
      .update(type)
      .update(PROMPT_VERSION)
      .digest("hex");

    // force 跳过缓存
    if (!force) {
      const cached = resultCache.get(cacheKey);
      if (cached) {
        return NextResponse.json({ result: cached.result, cached: true });
      }
    }

    // 构建用户消息
    let userContent = paperText;
    const parts: string[] = [];
    if (selectedSubject) {
      parts.push("用户的研究方向：" + selectedSubject);
    }
    if (userQuestion) {
      parts.push("用户的提问：" + userQuestion);
    }
    if (parts.length > 0) {
      userContent = parts.join("\n") + "\n\n论文内容如下：\n" + paperText;
    }

    const result = await callDeepSeek(prompt, userContent);

    // 写入缓存（LRU：超过上限清最早一半）
    if (resultCache.size >= CACHE_MAX_SIZE) {
      const entries = [...resultCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < Math.floor(CACHE_MAX_SIZE / 2); i++) {
        resultCache.delete(entries[i][0]);
      }
    }
    resultCache.set(cacheKey, { result, timestamp: Date.now() });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("分析失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析失败，请重试" },
      { status: 500 }
    );
  }
}
