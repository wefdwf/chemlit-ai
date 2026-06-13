import { NextRequest, NextResponse } from "next/server";
import { CHART_PROMPT } from "@/lib/prompts";

// 千问（通义千问）多模态 API，OpenAI 兼容格式
const QWEN_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const QWEN_MODEL = "qwen-vl-plus";

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
    if (!apiKey || apiKey === "你的千问API_KEY") {
      return NextResponse.json(
        { error: "千问 API Key 未配置，请在 .env.local 中设置 QWEN_API_KEY" },
        { status: 500 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000); // 60s 超时

    try {
      const response = await fetch(QWEN_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: QWEN_MODEL,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "请先阅读以下文献背景信息，用于辅助理解后续图片：\n\n"
                    + (userQuestion
                    ? `用户研究方向/提问：${userQuestion}\n\n`
                    : "") + (paperText
                    ? `文献内容：${paperText.slice(0, 5000)}\n\n`
                    : ""),
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType || "image/png"};base64,${imageBase64}`,
                  },
                },
                {
                  type: "text",
                  text: CHART_PROMPT,
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`千问 API 错误: ${response.status} ${error}`);
      }

      const data = await response.json();
      return NextResponse.json({ result: data.choices[0].message.content });
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
