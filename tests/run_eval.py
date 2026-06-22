"""
ChemLit AI 离线评测运行器
==========================
用法：
  python tests/run_eval.py                     # 跑测试目录下所有 PDF
  python tests/run_eval.py --pdf <file.pdf>     # 跑单个 PDF
  python tests/run_eval.py --skip-api           # 只跑 L1（已有 outputs JSON）

前提：
  - npm run dev 已在 localhost:3000 启动
  - DEEPSEEK_API_KEY 已在 .env.local 配置

流程：
  1. PyPDF2 提取 PDF 文本
  2. POST /api/upload → 获取文本
  3. POST /api/analyze (type=main) → 主分析
  4. POST /api/analyze (type=overview/structure/terms) → 三个子模块
  5. 保存到 tests/outputs/YYYY-MM-DD.json
  6. 自动运行 L1 规则检查
"""

import json
import os
import sys
import time
import argparse
from datetime import datetime
from pathlib import Path

import re
import requests
from PyPDF2 import PdfReader

# ─── 配置 ───────────────────────────────────────────────────

API_BASE = "http://localhost:3000"
TEST_PDF_DIR = Path("C:/Users/28067/Desktop/测试")
OUTPUT_DIR = Path(__file__).parent / "outputs"

# 测试用例配置：(PDF关键词, 化学分支, 用户提问, 预期行为)
# 预期行为用于方向矛盾检测等需要上下文的检查
TEST_CASES = {
    "dynamics-of-dissolutive-wetting": {
        "subject": "计算化学",
        "question": "这篇文献的分子动力学模拟方法对我的课题有什么参考价值？",
        "expect": "精读建议为推荐精读或可浏览，不触发方向矛盾",
    },
    "lean-docking-exploiting": {
        "subject": "计算化学",
        "question": "这篇文献使用的分子对接方法和其他方法相比有什么优势？",
        "expect": "精读建议给出明确等级",
    },
    "designed-synthesis-of-covalent": {
        "subject": "有机化学",
        "question": "这篇文献的合成策略是什么？产率如何？",
        "expect": "推荐精读，方向匹配",
    },
    "S001085452400448X": {
        "subject": "电化学",
        "question": "这篇文献讨论的腐蚀机理是什么？",
        "expect": "方向匹配",
    },
    "S0165993621000455": {
        "subject": "有机化学",
        "question": "这篇文献涉及的电池性能如何？",
        "expect": "⚠️ 触发方向矛盾（提问涉及电化学，选择有机化学）",
    },
    "S0266353826001739": {
        "subject": "高分子",
        "question": "这篇文献对聚合物材料的应用有什么启示？",
        "expect": "方向匹配或可浏览",
    },
    "S1872206724602123": {
        "subject": "分析化学",
        "question": "这篇文献用的检测方法是什么？检测限多少？",
        "expect": "方向匹配",
    },
}


def find_test_case(filename: str) -> dict | None:
    """根据 PDF 文件名匹配测试用例配置"""
    for key, config in TEST_CASES.items():
        if key.lower() in filename.lower():
            return config
    # 默认配置
    return {
        "subject": "不选择",
        "question": "这篇文献的核心创新点是什么？对我的研究方向有什么参考价值？",
        "expect": "正常输出",
    }


def extract_pdf_text(pdf_path: Path) -> tuple[str, int]:
    """PyPDF2 提取 PDF 文本"""
    reader = PdfReader(str(pdf_path))
    pages = len(reader.pages)
    texts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            texts.append(t)
    return "\n\n".join(texts), pages


def call_api(endpoint: str, body: dict, timeout: int = 90) -> dict:
    """调用本地 API"""
    url = f"{API_BASE}{endpoint}"
    resp = requests.post(url, json=body, timeout=timeout)
    if not resp.ok:
        return {"error": f"HTTP {resp.status_code}: {resp.text[:300]}"}
    return resp.json()


def run_single_pdf(pdf_path: Path) -> dict:
    """对单个 PDF 跑全流程评测"""
    filename = pdf_path.name
    test_case = find_test_case(filename)

    print(f"\n{'─'*60}")
    print(f"📄 {filename}")
    print(f"   分支: {test_case['subject']}  提问: {test_case['question'][:50]}...")

    # Step 1: 提取文本
    t0 = time.time()
    try:
        raw_text, pages = extract_pdf_text(pdf_path)
        print(f"   📖 提取文本: {len(raw_text):,} 字符, {pages} 页 ({time.time()-t0:.1f}s)")
    except Exception as e:
        print(f"   ❌ PDF 提取失败: {e}")
        return {"file": filename, "error": str(e)}

    if not raw_text.strip():
        return {"file": filename, "error": "PDF 无文字（可能是扫描版）"}

    # 模拟浏览器端压缩（复用 compressText 逻辑的 Python 版）
    compressed = compress_text_py(raw_text)
    print(f"   📦 压缩后: {len(compressed):,} 字符 (-{(1-len(compressed)/len(raw_text))*100:.0f}%)")

    result = {
        "file": filename,
        "subject": test_case["subject"],
        "question": test_case["question"],
        "expect": test_case["expect"],
        "pages": pages,
        "original_length": len(raw_text),
        "compressed_length": len(compressed),
    }

    # Step 2: /api/upload
    t0 = time.time()
    upload_resp = call_api("/api/upload", {"text": compressed, "title": filename})
    if "error" in upload_resp:
        result["error"] = upload_resp["error"]
        print(f"   ❌ upload 失败: {upload_resp['error']}")
        return result
    server_text = upload_resp.get("text", "")
    print(f"   ⬆ upload OK ({time.time()-t0:.1f}s)")

    # Step 3: 主分析
    t0 = time.time()
    main_resp = call_api("/api/analyze", {
        "paperText": server_text,
        "type": "main",
        "userQuestion": test_case["question"],
        "selectedSubject": test_case["subject"],
        "force": True,
    })
    result["main"] = main_resp.get("result", "")
    result["main_cached"] = main_resp.get("cached", False)
    dur = time.time() - t0
    tok = len(result["main"]) if result["main"] else 0
    print(f"   🧠 main ({tok} chars, {dur:.1f}s){' [缓存]' if result['main_cached'] else ''}")

    if "error" in main_resp:
        print(f"   ❌ main 失败: {main_resp['error']}")
        return result

    # Step 4: 三个子模块（并行调，但为避免 429 串行）
    for module, label in [("overview", "速览"), ("structure", "框架"), ("terms", "术语")]:
        t0 = time.time()
        resp = call_api("/api/analyze", {
            "paperText": server_text,
            "type": module,
            "userQuestion": test_case["question"],
            "selectedSubject": test_case["subject"],
            "force": True,
        })
        result[module] = resp.get("result", "")
        dur = time.time() - t0
        tok = len(result[module]) if result[module] else 0
        cache_mark = " [缓存]" if resp.get("cached") else ""
        print(f"   📋 {label} ({tok} chars, {dur:.1f}s){cache_mark}")

        if "error" in resp:
            print(f"   ⚠️ {module} 失败: {resp['error']}")

    return result


# ─── 简易 Python 版文本压缩（模拟 compressText.ts） ─────────

def compress_text_py(text: str, max_length: int = 120000) -> str:
    """Python 版浏览器端压缩（与 compressText.ts 逻辑对齐）"""
    result = text

    # 1. 去参考文献
    ref_patterns = [
        r"(?m)^References?\s*$", r"(?m)^REFERENCES?\s*$",
        r"(?m)^Bibliography\s*$", r"(?m)^BIBLIOGRAPHY\s*$",
        r"(?m)^Literature\s*Cited\s*$", r"(?m)^LITERATURE\s*CITED\s*$",
        r"(?m)^参考文献\s*$", r"(?m)^引用文献\s*$",
    ]
    lower_third = int(len(result) * 0.6)
    for pat in ref_patterns:
        for m in re.finditer(pat, result):
            if m.start() > lower_third and len(m.group()) <= 80:
                result = result[:m.start()].strip()
                break

    # 2. 去致谢
    ack_patterns = [
        r"(?m)^Acknowledgments?\s*$", r"(?m)^ACKNOWLEDGMENTS?\s*$",
        r"(?m)^Acknowledgements?\s*$", r"(?m)^ACKNOWLEDGEMENTS?\s*$",
        r"(?m)^致谢\s*$", r"(?m)^Funding\s*$", r"(?m)^FUNDING\s*$",
    ]
    half = int(len(result) * 0.5)
    section_header = re.compile(
        r"(?m)^(?:Abstract|Introduction|Experimental|Method|Result|Discussion|"
        r"Conclusion|Appendix|Supporting|Supplementary|References?|Bibliography|"
        r"Acknowledgments?|Author\s+Contribution|Conflict|Declaration|"
        r"摘要|引言|实验|方法|结果|讨论|结论|附录|参考文献|致谢)"
    )
    for pat in ack_patterns:
        m = re.search(pat, result[half:])
        if m:
            actual_pos = half + m.start()
            after = result[actual_pos + len(m.group()):]
            next_section = section_header.search(after)
            if next_section:
                result = result[:actual_pos] + after[next_section.start():]
            else:
                result = result[:actual_pos]
            break

    # 3. 去页眉页脚
    lines = result.split("\n")
    filtered = []
    for line in lines:
        trimmed = line.strip()
        if re.match(r"^\d{1,4}$", trimmed):
            continue
        if re.match(r"^Page\s+\d+", trimmed, re.IGNORECASE):
            continue
        if len(trimmed) < 3 and not re.search(r"[一-鿿]", trimmed):
            continue
        filtered.append(line)
    result = "\n".join(filtered)

    # 4. 空白规范化
    result = re.sub(r"[ \t]+", " ", result)
    result = re.sub(r"\n{3,}", "\n\n", result)
    result = re.sub(r"[ \t]+\n", "\n", result)
    result = re.sub(r"\n[ \t]+", "\n", result)
    result = result.strip()

    # 5. 智能截断
    if len(result) > max_length:
        marker = "\n\n[文本过长，已截断]"
        slice_ = result[:max_length]
        min_cut = int(max_length * 0.7)
        para_break = slice_.rfind("\n\n")
        if para_break > min_cut:
            result = result[:para_break] + marker
        else:
            sentence_match = re.search(r"[.!?。！？]\s", slice_[min_cut:])
            if sentence_match:
                result = slice_[:min_cut + sentence_match.start() + 1] + marker
            else:
                last_space = slice_.rfind(" ")
                if last_space > int(max_length * 0.8):
                    result = slice_[:last_space] + marker
                else:
                    result = slice_ + marker

    return result


# ─── 入口 ───────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ChemLit AI 离线评测运行器")
    parser.add_argument("--pdf", type=str, help="单个 PDF 文件路径")
    parser.add_argument("--skip-api", action="store_true", help="跳过 API 调用，只跑 L1")
    parser.add_argument("--limit", type=int, default=0, help="限制评测 PDF 数量（0=全部）")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.skip_api:
        # 只跑 L1
        from l1_checks import main as l1_main
        import subprocess
        today = datetime.now().strftime("%Y-%m-%d")
        output_file = OUTPUT_DIR / f"{today}.json"
        if output_file.exists():
            subprocess.run([sys.executable, __file__.replace("run_eval.py", "l1_checks.py"), str(output_file)])
        else:
            print(f"没有找到输出文件: {output_file}")
        return

    # 收集 PDF 文件
    if args.pdf:
        pdf_paths = [Path(args.pdf)]
    else:
        pdf_paths = sorted(TEST_PDF_DIR.glob("*.pdf"))

    if args.limit > 0:
        pdf_paths = pdf_paths[: args.limit]

    print(f"🔬 ChemLit AI 离线评测")
    print(f"   API: {API_BASE}")
    print(f"   PDF 数量: {len(pdf_paths)}")
    print(f"   输出目录: {OUTPUT_DIR}")

    # 检查服务是否在线
    try:
        requests.get(f"{API_BASE}/api/analyze", timeout=3)
    except requests.ConnectionError:
        print("\n⚠️ 无法连接到本地服务。请先运行:")
        print("   cd chemlit-ai && npm run dev")
        print("   然后重新运行本脚本")
        sys.exit(1)

    # 逐文件评测
    all_results = []
    for pdf_path in pdf_paths:
        try:
            result = run_single_pdf(pdf_path)
            all_results.append(result)
        except Exception as e:
            print(f"   ❌ 异常: {e}")
            all_results.append({"file": pdf_path.name, "error": str(e)})
        # 避免 API 限流
        time.sleep(1)

    # 保存结果
    today = datetime.now().strftime("%Y-%m-%d")
    output_file = OUTPUT_DIR / f"{today}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n💾 结果已保存: {output_file}")

    # 自动跑 L1
    print(f"\n{'='*60}")
    print("🔍 运行 L1 规则检查...")
    import subprocess
    subprocess.run([sys.executable, __file__.replace("run_eval.py", "l1_checks.py"), str(output_file)])


if __name__ == "__main__":
    main()
