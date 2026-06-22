import { NextRequest, NextResponse } from "next/server";
import { CHART_PROMPT } from "@/lib/prompts";

// 千问多模态原生 API
const QWEN_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const QWEN_MODEL = "qwen-vl-max";

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType, paperText, userQuestion } = await request.json();

    if (!imageBase64) {
      return NextResponse.json(
        { error: "请上传图表图片" },
        { status: 400 }
      );
    }

    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "千问 API Key 未配置，请在 .env.local 中设置 QWEN_API_KEY" },
        { status: 500 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      // 构建 content 数组（原生格式：{"image": ..., "text": ...}）
      const content: Record<string, string>[] = [];

      // 文献背景信息
      const contextParts: string[] = [];
      if (userQuestion) {
        contextParts.push(`用户研究方向/提问：${userQuestion}`);
      }
      if (paperText) {
        contextParts.push(`文献内容：${paperText.slice(0, 5000)}`);
      }
      if (contextParts.length > 0) {
        content.push({ text: "请先阅读以下文献背景信息，用于辅助理解后续图片：\n\n" + contextParts.join("\n\n") });
      }

      // 图片
      content.push({ image: `data:${mimeType || "image/png"};base64,${imageBase64}` });

      // CHART_PROMPT
      content.push({ text: CHART_PROMPT });

      const response = await fetch(QWEN_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: QWEN_MODEL,
          input: {
            messages: [
              {
                role: "user",
                content,
              },
            ],
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`千问 API 错误: ${response.status} ${error}`);
      }

      const data = await response.json();
      // 原生 API 返回 output.choices[0].message.content，是 [{text: "..."}] 数组
      const contentList = data.output?.choices?.[0]?.message?.content;
      const result = Array.isArray(contentList)
        ? contentList.map((item: { text?: string }) => item.text || "").join("")
        : "";
      return NextResponse.json({ result });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("图表解读失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "图表解读失败，请重试" },
      { status: 500 }
    );
  }
}
