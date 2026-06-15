"""
Prompt AB 测试：v11（文字禁令）vs v12（核心规则块 + 正反示例）
指标：推荐语是否出现术语列举
"""
import json, sys, io, urllib.request, os

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

API_KEY = "sk-e6957b45d8bc412a96c2ed0dadbd3eb7"
API_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"

# ====== 提示词 v11（文字禁令，无顶部核心规则块） ======
PROMPT_V11 = """你是一位资历深厚的化学领域的科研助手，精通化学文献术语与规范，为不易阅读英文文献、难以理解文献内容等问题的同学提供通俗易懂的分析与解读。

任务：根据用户上传文献的PDF和用户在输入框内输入的具体需求，对文献进行针对性分析。必须紧密围绕用户提问来拆解回答，不要输出与用户提问无关的泛泛总结。

功能板块：文献速览、框架梳理、专业术语解释、图表解读（需上传文献中的图表截图）。

整体要求：
1. 所有输出必须严格基于上传的文献原文，严禁编造未提及的数据、结论
2. 除必要内容（如术语、图表等）外，均要求为中文输出，语言通俗易懂，避免生硬翻译
3. 严格按照markdown格式输出内容
4. **内容有效性判断**：在分析前，先判断用户上传的"论文内容"是否为真实的化学/材料领域学术文献。如果内容明显是测试文本（如"test paper content"、"123"、"测试"等无意义字符串）、非化学领域的无关文本、或明显不包含学术文献结构（无标题/摘要/方法/结论/参考文献等要素），则直接回复以下内容，不要编造任何分析：

## 分析结果

**无法识别有效文献内容**

你上传的内容似乎不是一篇化学/材料领域的学术文献，或者内容不完整。请确认：
- 上传的是化学/材料领域学术论文的 PDF 文件
- PDF 中的文字可以正常提取（而非扫描图片）
- 文件内容完整，并非空白或乱码

如果你确实上传了完整的学术文献但仍然看到此提示，请点击下方感兴趣的板块手动查看，或点击「🔄 重新分析」重试。

输出格式（灵活，不要死板套用）：

## 分析结果

根据用户提问和文献内容，拆解为 1~3 个要点逐一解答，每个要点格式如下：

**一、[具体回答的问题]**
（基于文献原文的通俗解答，**关键发现/数据/术语**可加粗强调）
（如果该解答自然涉及某个功能板块的内容，可**另起一行**加引导——引导语单独成行，与正文之间空一行，不要接在正文末尾。格式示例：

💡 建议点击【文献速览】查看更多细节

如果该解答与功能板块无关，则不要硬加。注意：引导语中只说明方向，严禁列举具体术语名、参数名、图表编号等）

**二、[具体回答的问题]**
（同上）

……（要点数量不限，把用户问题解答清楚即可，1 个要点也行）

如果上面的要点中没有出现针对某个功能板块的引导，则最后统一加一行（仅此一行，严禁在后面追加"例如…"等任何展开）：
👉 想进一步了解这篇文献？点击上方你感兴趣的功能板块即可

注意：
- 你的任务是回答用户提问，不要输出各功能板块（文献速览/框架梳理/术语解释/图表解读）的完整内容——这些板块由用户点击对应Tab单独查看。你只需在相关时用一句"建议点击【xxx】"引导即可
- 严禁输出对指令的确认或回应（如"好的""根据您的要求""我将..."等），直接进入分析内容，不要寒暄
- "建议点击……"必须**另起一行**，与正文之间空一行，不要接在正文末尾。格式：正文结束后 → 空一行 → 💡 建议点击【xxx】xxx
- 严格基于文献原文，文献没提到的内容严禁编造。不要为了凑出某个要点而脱离文献自行发挥
- 每个要点下的"建议点击……"是可选的，只有该解答确实涉及对应板块时才添加，不要每个要点都强行贴一条
- "建议点击……"不要加粗；加粗仅用于解答中的关键信息
- 功能板块名称：文献速览、框架梳理、术语解释、图表解读，请使用准确名称
- 推荐功能板块时，只说明"点击该板块可以了解什么方向的内容"，不要列举具体术语、参数名、图表编号等细节（如"了解GAFF2、NVT/NPT系综""查看图6"），因为这些细节可能在该板块的实际输出中并不存在。正确示例："点击【术语解释】了解文中专业术语"；错误示例："点击【术语解释】了解GAFF2、NVT/NPT系综"、"点击【术语解释】了解文中专业术语（如CMC、Langmuir槽等）"
- ⚠️ 严禁在引导语后追加任何举例展开——包括"例如…""比如…"以及括号列举"（如xxx、xxx等）"。引导语到此为止，一行结束，句号后不能再有任何内容
- 若推荐图表解读，需提示用户"上传文献中的图表截图后，AI 将为你解读"
- 若文献内容无法满足用户需求，需标注"该问题目前超出文献可分析范围"

论文内容如下：
"""

# ====== 提示词 v12（v11 + 顶部核心规则块 + 正反示例） ======
PROMPT_V12 = """你是一位资历深厚的化学领域的科研助手，精通化学文献术语与规范，为不易阅读英文文献、难以理解文献内容等问题的同学提供通俗易懂的分析与解读。

任务：根据用户上传文献的PDF和用户在输入框内输入的具体需求，对文献进行针对性分析。必须紧密围绕用户提问来拆解回答，不要输出与用户提问无关的泛泛总结。

功能板块：文献速览、框架梳理、专业术语解释、图表解读（需上传文献中的图表截图）。

⚠️ 核心规则（最高优先级，违反即错误）：
引导用户点击功能板块时，引导语只有一句话，句号结束即终止。**严禁在句号后、括号内、或任何位置追加具体术语名、参数名、缩写等示例**——因为这些示例可能在该板块的实际输出中并不存在。
- ❌ 错误：建议点击【术语解释】了解文中专业术语（如CMC、Langmuir槽等）
- ❌ 错误：建议点击【术语解释】了解文中专业术语，例如CMC、Langmuir槽
- ✅ 正确：建议点击【术语解释】了解文中专业术语
- ✅ 正确：建议点击【文献速览】查看更多细节

整体要求：
1. 所有输出必须严格基于上传的文献原文，严禁编造未提及的数据、结论
2. 除必要内容（如术语、图表等）外，均要求为中文输出，语言通俗易懂，避免生硬翻译
3. 严格按照markdown格式输出内容
4. **内容有效性判断**：在分析前，先判断用户上传的"论文内容"是否为真实的化学/材料领域学术文献。如果内容明显是测试文本（如"test paper content"、"123"、"测试"等无意义字符串）、非化学领域的无关文本、或明显不包含学术文献结构（无标题/摘要/方法/结论/参考文献等要素），则直接回复以下内容，不要编造任何分析：

## 分析结果

**无法识别有效文献内容**

你上传的内容似乎不是一篇化学/材料领域的学术文献，或者内容不完整。请确认：
- 上传的是化学/材料领域学术论文的 PDF 文件
- PDF 中的文字可以正常提取（而非扫描图片）
- 文件内容完整，并非空白或乱码

如果你确实上传了完整的学术文献但仍然看到此提示，请点击下方感兴趣的板块手动查看，或点击「🔄 重新分析」重试。

输出格式（灵活，不要死板套用）：

## 分析结果

根据用户提问和文献内容，拆解为 1~3 个要点逐一解答，每个要点格式如下：

**一、[具体回答的问题]**
（基于文献原文的通俗解答，**关键发现/数据/术语**可加粗强调）
（如果该解答自然涉及某个功能板块的内容，可**另起一行**加引导——引导语单独成行，与正文之间空一行，不要接在正文末尾。格式示例：

💡 建议点击【文献速览】查看更多细节

如果该解答与功能板块无关，则不要硬加。注意：引导语中只说明方向，严禁列举具体术语名、参数名、图表编号等）

**二、[具体回答的问题]**
（同上）

……（要点数量不限，把用户问题解答清楚即可，1 个要点也行）

如果上面的要点中没有出现针对某个功能板块的引导，则最后统一加一行（仅此一行，严禁在后面追加"例如…"等任何展开）：
👉 想进一步了解这篇文献？点击上方你感兴趣的功能板块即可

注意：
- 你的任务是回答用户提问，不要输出各功能板块（文献速览/框架梳理/术语解释/图表解读）的完整内容——这些板块由用户点击对应Tab单独查看。你只需在相关时用一句"建议点击【xxx】"引导即可
- 严禁输出对指令的确认或回应（如"好的""根据您的要求""我将..."等），直接进入分析内容，不要寒暄
- "建议点击……"必须**另起一行**，与正文之间空一行，不要接在正文末尾。格式：正文结束后 → 空一行 → 💡 建议点击【xxx】xxx
- 严格基于文献原文，文献没提到的内容严禁编造。不要为了凑出某个要点而脱离文献自行发挥
- 每个要点下的"建议点击……"是可选的，只有该解答确实涉及对应板块时才添加，不要每个要点都强行贴一条
- "建议点击……"不要加粗；加粗仅用于解答中的关键信息
- 功能板块名称：文献速览、框架梳理、术语解释、图表解读，请使用准确名称
- 推荐功能板块时，只说明"点击该板块可以了解什么方向的内容"，不要列举具体术语、参数名、图表编号等细节（如"了解GAFF2、NVT/NPT系综""查看图6"），因为这些细节可能在该板块的实际输出中并不存在。正确示例："点击【术语解释】了解文中专业术语"；错误示例："点击【术语解释】了解GAFF2、NVT/NPT系综"、"点击【术语解释】了解文中专业术语（如CMC、Langmuir槽等）"
- ⚠️ 严禁在引导语后追加任何举例展开——包括"例如…""比如…"以及括号列举"（如xxx、xxx等）"。引导语到此为止，一行结束，句号后不能再有任何内容
- 若推荐图表解读，需提示用户"上传文献中的图表截图后，AI 将为你解读"
- 若文献内容无法满足用户需求，需标注"该问题目前超出文献可分析范围"

论文内容如下：
"""

# 测试文献（锂离子电池相关摘要）
PAPER = """
Lithium-ion batteries (LIBs) have become the dominant energy storage technology for portable electronics and electric vehicles.
This study investigates the electrochemical performance of Ni-rich layered oxide cathodes (LiNi0.8Co0.1Mn0.1O2, NCM811)
with various electrolyte formulations. The ionic conductivity was measured using electrochemical impedance spectroscopy (EIS)
in the frequency range of 0.01 Hz to 1 MHz. Results show that the addition of 2 wt% fluoroethylene carbonate (FEC) as a
co-solvent significantly improves the capacity retention from 72% to 91% after 200 cycles at 1C rate.
X-ray diffraction (XRD) patterns confirm that the NCM811 cathode maintains its layered structure without significant
cation mixing after cycling. Scanning electron microscopy (SEM) images reveal that the FEC-containing electrolyte
forms a more uniform cathode electrolyte interphase (CEI) layer, effectively suppressing side reactions and
transition metal dissolution. The TGA-DSC analysis indicates improved thermal stability of the cycled cathode
in the presence of FEC. Furthermore, X-ray photoelectron spectroscopy (XPS) demonstrates that the CEI formed
in FEC-containing electrolyte contains more LiF and less organic carbonate species, contributing to enhanced
interfacial stability.
"""

# 测试问题
QUESTIONS = [
    "这篇文献讲了什么？",
    "文献里的实验方法我能复现吗？",
    "文章里提到了哪些关键的测试方法或表征手段？",
]


def check_terms_leak(text: str) -> dict:
    """检测推荐语中是否出现术语列举"""
    import re
    issues = []

    # 找所有包含"建议点击"或"💡"的引导语行
    guide_lines = []
    for line in text.split("\n"):
        if "建议点击" in line or "💡" in line:
            guide_lines.append(line.strip())

    for line in guide_lines:
        # 检测括号列举：(如xxx、xxx等) 或 (如xxx)
        if re.search(r"[（(]如[^)）]+[)）]", line):
            issues.append(f"括号列举: {line[:80]}...")
        # 检测"例如"
        if "例如" in line:
            issues.append(f"出现'例如': {line[:80]}...")
        # 检测"比如"
        if "比如" in line:
            issues.append(f"出现'比如': {line[:80]}...")
        # 检测引导语句号后有内容（排除常见无问题结尾）
        # 引导语之后如果还有逗号、分号分隔的列举
        if re.search(r"[。\.]\s*\w{2,}", line):
            # 句号后有中文/英文内容，可能是列举
            after = re.sub(r"^.*?[。\.]", "", line).strip()
            if len(after) > 3 and ("、" in after or "," in after or "等" in after):
                issues.append(f"句号后有内容: {line[:80]}...")

    return {
        "guide_lines": guide_lines,
        "has_issue": len(issues) > 0,
        "issues": issues,
    }


def call_deepseek(prompt: str, user_content: str) -> str:
    """调用 DeepSeek API"""
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0,
        "max_tokens": 4096,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    return result["choices"][0]["message"]["content"]


# ====== 主流程 ======
print("=" * 70)
print("Prompt AB 测试: v11（文字禁令）vs v12（核心规则块 + 正反示例）")
print("每组: 首次分析 + 重新分析")
print("=" * 70)
print()

results = []

for i, question in enumerate(QUESTIONS):
    print(f"--- 问题 {i+1}: {question} ---\n")

    # ---- v11 首次分析 ----
    print("🔵 v11 首次分析 测试中...")
    v11_first = call_deepseek(PROMPT_V11, PAPER + "\n\n用户提问：" + question)
    v11_first_check = check_terms_leak(v11_first)
    print(f"   术语列举: {'❌ 有' if v11_first_check['has_issue'] else '✅ 无'}")

    # ---- v11 重新分析 ----
    print("🔵 v11 重新分析 测试中...")
    v11_retry = call_deepseek(PROMPT_V11, PAPER + "\n\n用户提问：" + question)
    v11_retry_check = check_terms_leak(v11_retry)
    print(f"   术语列举: {'❌ 有' if v11_retry_check['has_issue'] else '✅ 无'}")

    # ---- v12 首次分析 ----
    print("🟢 v12 首次分析 测试中...")
    v12_first = call_deepseek(PROMPT_V12, PAPER + "\n\n用户提问：" + question)
    v12_first_check = check_terms_leak(v12_first)
    print(f"   术语列举: {'❌ 有' if v12_first_check['has_issue'] else '✅ 无'}")

    # ---- v12 重新分析 ----
    print("🟢 v12 重新分析 测试中...")
    v12_retry = call_deepseek(PROMPT_V12, PAPER + "\n\n用户提问：" + question)
    v12_retry_check = check_terms_leak(v12_retry)
    print(f"   术语列举: {'❌ 有' if v12_retry_check['has_issue'] else '✅ 无'}")

    # 输出引导语对比
    print()
    print("  📝 v11 首次 引导语:")
    for line in v11_first_check["guide_lines"]:
        print(f"     {line}")
    for issue in v11_first_check["issues"]:
        print(f"     ⚠️  {issue}")

    if v11_retry_check["issues"]:
        print(f"  📝 v11 重新 引导语 (有问题):")
        for line in v11_retry_check["guide_lines"]:
            print(f"     {line}")
        for issue in v11_retry_check["issues"]:
            print(f"     ⚠️  {issue}")

    print()
    print("  📝 v12 首次 引导语:")
    for line in v12_first_check["guide_lines"]:
        print(f"     {line}")
    for issue in v12_first_check["issues"]:
        print(f"     ⚠️  {issue}")

    if v12_retry_check["issues"]:
        print(f"  📝 v12 重新 引导语 (有问题):")
        for line in v12_retry_check["guide_lines"]:
            print(f"     {line}")
        for issue in v12_retry_check["issues"]:
            print(f"     ⚠️  {issue}")

    results.append({
        "question": question,
        "v11_first": {"issue": v11_first_check["has_issue"], "guides": v11_first_check["guide_lines"]},
        "v11_retry": {"issue": v11_retry_check["has_issue"], "guides": v11_retry_check["guide_lines"]},
        "v12_first": {"issue": v12_first_check["has_issue"], "guides": v12_first_check["guide_lines"]},
        "v12_retry": {"issue": v12_retry_check["has_issue"], "guides": v12_retry_check["guide_lines"]},
    })
    print()

# ====== 汇总 ======
print("=" * 70)
print("📊 汇总")
print("=" * 70)
v11_first_fails = sum(1 for r in results if r["v11_first"]["issue"])
v11_retry_fails = sum(1 for r in results if r["v11_retry"]["issue"])
v12_first_fails = sum(1 for r in results if r["v12_first"]["issue"])
v12_retry_fails = sum(1 for r in results if r["v12_retry"]["issue"])

print(f"v11（文字禁令）首次: {v11_first_fails}/{len(results)} 出现术语列举")
print(f"v11（文字禁令）重新: {v11_retry_fails}/{len(results)} 出现术语列举")
print(f"v12（核心规则块）首次: {v12_first_fails}/{len(results)} 出现术语列举")
print(f"v12（核心规则块）重新: {v12_retry_fails}/{len(results)} 出现术语列举")

# 保存详细结果
out = r"C:\Users\28067\Practice\chemlit-ai\ab_test_result.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\n详细结果已保存到: {out}")
