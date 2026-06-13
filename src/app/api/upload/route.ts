import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请上传 PDF 文件" }, { status: 400 });
    }

    if (!file.name.endsWith(".pdf")) {
      return NextResponse.json({ error: "仅支持 PDF 文件" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });

    if (!text.trim()) {
      return NextResponse.json(
        { error: "PDF 中未能提取到文字，可能是扫描版 PDF" },
        { status: 400 }
      );
    }

    if (totalPages > 30) {
      return NextResponse.json(
        { error: `PDF 共 ${totalPages} 页，超过 30 页限制，请上传更短的论文` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      text: text.slice(0, 80000),
      pages: totalPages,
      title: "已上传文献",
    });
  } catch (error) {
    console.error("PDF 解析失败:", error);
    return NextResponse.json(
      { error: "PDF 解析失败，请确认文件未损坏且为文字型 PDF（非扫描版）" },
      { status: 500 }
    );
  }
}
