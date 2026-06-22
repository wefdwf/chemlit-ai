"""
ChemLit AI L1 离线规则检查
============================
不调 API，纯正则/字符串匹配，秒级出结果。
每次改 prompt 后必跑。

用法：
  python tests/l1_checks.py tests/outputs/2026-06-21.json
  python tests/l1_checks.py tests/outputs/          # 跑目录下所有 JSON

输出 JSON 格式：
{
  "results": [
    {
      "file": "1-s2.0-xxx-main.pdf",
      "modules": {
        "main": [
          {"rule": "禁止引导语句号后追加内容", "pass": true},
          ...
        ],
        "overview": [...],
        ...
      },
      "summary": {"total": 23, "pass": 21, "fail": 2, "errors": 0}
    }
  ],
  "overall": {"total": 69, "pass": 63, "fail": 6, "errors": 0}
}

严重级别：
  error — 检测逻辑精确，基本无误报风险（纯格式/结构匹配），失败必须关注
  warn  — 检测可能漏报或误报（语义匹配/关键词组合），失败供参考
"""

import json
import re
import sys
import os
from pathlib import Path
from typing import Any

# ─── 模块名称映射 ─────────────────────────────────────────────

MODULE_NAMES = {
    "main": "主分析",
    "overview": "文献速览",
    "structure": "框架梳理",
    "terms": "术语解释",
    "chart": "图表解读",
}


def make_rules() -> dict[str, list[tuple[str, Any, str]]]:
    """生成规则表。

    分级原则：
      error — 纯格式/结构匹配，无误报风险（如输出非空、五字段、术语格式、markdown标题检测）
      warn  — 语义匹配/关键词组合，可能漏报或误报（如越界检测、引导语规则、寒暄语）
    """

    # ===== 通用规则（所有模块） =====
    common_rules: list[tuple[str, Any, str]] = [
        (
            "输出非空",
            lambda text: bool(text) and len(text.strip()) > 10,
            "error",  # 纯长度检查，无误报
        ),
        (
            "禁止寒暄确认语",
            lambda text: not re.search(
                r"^\s*(好的|根据您的要求|我将|让我|收到|明白)",
                text, re.MULTILINE
            ),
            "warn",  # 只检测行首，AI 可在句中写寒暄
        ),
    ]

    # ===== 主分析专用规则 =====
    main_rules = common_rules + [
        (
            "引导语句号后禁止追加内容",
            lambda text: not re.search(
                r"建议点击【[^】]+】[^。\n]*[，,][^。\n]*[（(]",
                text
            ),
            "error",  # 正则无法穷举所有追加模式
        ),
        (
            "禁止引导语括号列举术语",
            lambda text: not re.search(
                r"建议点击【[^】]+】[^。\n]*[（(]如\s*\w",
                text
            ),
            "error",  # 正则变体多，可能漏
        ),
        (
            "禁止引导语'例如''比如'",
            lambda text: not re.search(
                r"建议点击【[^】]+】[^。\n]*(例如|比如)",
                text
            ),
            "error",  # 同上，正则覆盖不全
        ),
        (
            "引导语后禁止列举术语名（xxx、xxx等）",
            lambda text: not re.search(
                r"建议点击【[^】]+】[^。\n]*[（(]\w+[、，]\w+",
                text
            ),
            "error",  # 可能匹配到正常内容中的括号列举
        ),
        (
            "包含内容有效性判断（非空时）",
            lambda text: any(kw in text for kw in [
                "无法识别有效文献内容",
                "分析结果",
                "## 分析结果",
            ]),
            "error",  # 关键词匹配，false negative 风险
        ),
        (
            "禁止输出子模块完整内容标记",
            lambda text: not (
                text.count("### 一句话总结") > 0
                and text.count("### 创新点") > 0
                and text.count("### 方法概述") > 0
            ),
            "error",  # 三标记同时出现才判违规，阈值可能不完美
        ),
    ]

    # ===== 文献速览规则 =====
    overview_rules = common_rules + [
        (
            "输出五字段结构",
            lambda text: all(kw in text for kw in [
                "一句话总结", "创新点", "方法概述", "关键结论", "精读建议"
            ]),
            "error",  # 五个固定关键词全量匹配，无误报
        ),
        (
            "精读建议三等级之一",
            lambda text: any(level in text for level in [
                "推荐精读", "可浏览", "不建议精读"
            ]),
            "error",  # 三个固定短语精确匹配，无误报
        ),
        (
            "禁止越界输出术语解释",
            lambda text: not re.search(
                r"术语解释|术语名称.*【.*方向",
                text
            ),
            "warn",  # 关键词可能出现在正常论述中
        ),
        (
            "禁止越界输出框架梳理",
            lambda text: not re.search(
                r"研究问题.*研究目标.*实验设计|研究问题.*研究目标.*计算方法",
                text, re.DOTALL
            ),
            "warn",  # 正则可能误匹配正常描述
        ),
        (
            "方向矛盾检测格式（触发时）",
            lambda text: _check_direction_conflict(text),
            "error",  # PRD 7.3 + F3 验收标准：触发时必须输出 ⚠️ 警告三要素
        ),
    ]

    # ===== 框架梳理规则 =====
    structure_rules = common_rules + [
        (
            "包含文献类型判断分支",
            lambda text: any(kw in text for kw in [
                "研究问题", "研究目标", "文献背景"
            ]),
            "warn",  # 关键词缺失不代表格式不合格
        ),
        (
            "输出包含结论或局限节点",
            lambda text: any(kw in text for kw in [
                "结论", "局限", "展望"
            ]),
            "error",  # PRD F4 验收标准：三种模板收尾都有结论/局限/展望，无误报
        ),
        (
            "输出加粗标签",
            lambda text: "**" in text,
            "error",  # PRD F4 验收标准：加粗标签是 markdown 精确标记，无误报
        ),
        (
            "文献未体现标注格式（触发时）",
            lambda text: _check_missing_label(text),
            "warn",  # PRD F4 验收标准：文献缺失节点必须标注"文献未体现"，但无法从输出判该不该标
        ),
        (
            "禁止越界输出术语解释",
            lambda text: not re.search(
                r"术语名称.*【.*方向",
                text
            ),
            "warn",  # PRD F4 验收标准，关键词可能出现在正常描述中
        ),
        (
            "禁止越界输出文献速览",
            lambda text: not (
                "一句话总结" in text and "创新点" in text and "精读建议" in text
            ),
            "warn",  # PRD F4 验收标准，三关键词同时出现才判越界
        ),
    ]

    # ===== 术语解释规则 =====
    terms_rules = common_rules + [
        (
            "输出术语列表格式",
            lambda text: bool(re.search(
                r"\*\*[^*]+\*\*\s*【[^】]+】",
                text
            )),
            "error",  # 精确匹配 `**术语** 【方向】` 格式，无误报
        ),
        (
            "术语数量 5-10 个",
            lambda text: 5 <= len(re.findall(
                r"\*\*[^*]+\*\*\s*【[^】]+】",
                text
            )) <= 10,
            "warn",  # 数量边界值（4或11）不一定是质量问题
        ),
        (
            "禁止越界输出文献速览",
            lambda text: not (
                "一句话总结" in text and "创新点" in text and "精读建议" in text
            ),
            "warn",  # PRD F5 验收标准，与其他越界检测统一为 warn
        ),
        (
            "禁止越界输出框架梳理",
            lambda text: not re.search(
                r"研究问题.*研究目标.*实验设计|研究问题.*研究目标.*计算方法",
                text, re.DOTALL
            ),
            "warn",
        ),
    ]

    # ===== 图表解读规则 =====
    chart_rules = common_rules + [
        (
            "包含图表类型判断",
            lambda text: any(kw in text for kw in [
                "图表类型", "该图片不是学术图表"
            ]),
            "warn",  # 关键词缺失不代表未做类型判断
        ),
        (
            "四段式格式（学术图表时）",
            lambda text: "该图片不是学术图表" in text or all(
                kw in text for kw in ["图表类型", "横坐标", "关键特征", "结论"]
            ),
            "error",  # 四个固定关键词全量匹配 OR 显式拒识，无误报
        ),
        (
            "禁止使用 markdown 标题（### ## #）",
            lambda text: not re.search(r"^#{1,3}\s", text, re.MULTILINE),
            "error",  # 纯格式正则 `^#{1,3}\s`，无误报
        ),
        (
            "非学术图表拒识格式（触发时）",
            lambda text: _check_non_academic_chart(text),
            "error",  # PRD 7.3 + F6 验收标准：触发时必须输出标题+副标题
        ),
    ]

    return {
        "main": main_rules,
        "overview": overview_rules,
        "structure": structure_rules,
        "terms": terms_rules,
        "chart": chart_rules,
    }


# ─── 专项检测函数 ─────────────────────────────────────────────

def _check_direction_conflict(text: str) -> bool:
    """PRD 7.3 + F3 验收标准：方向矛盾检测格式。

    若输出中触发了方向矛盾警告（含 ⚠️ 或方向矛盾提示语），
    格式必须包含三个要素：
      ① "你的提问涉及" + 方向名
      ② "当前选择的化学分支是" + 分支名
      ③ "建议确认"
    未触发方向矛盾时视为通过。
    """
    has_warning = "⚠" in text or "你的提问涉及" in text
    if not has_warning:
        return True

    # v15 格式："⚠️ 你的提问涉及**腐蚀科学**，但当前选择的化学分支是**电化学**，建议确认…"
    # "方向" 不再紧跟在领域名后，放宽为检测三要素存在即可
    has_question_direction = "你的提问涉及" in text
    has_selected_branch = "当前选择的化学分支是" in text
    has_suggestion = "建议确认" in text

    return has_question_direction and has_selected_branch and has_suggestion


def _check_missing_label(text: str) -> bool:
    """PRD F4 验收标准：文献未体现标注格式。

    若输出中使用了"文献未体现"标注（触发时），
    必须紧跟在框架节点标签之后（如"**结论**：文献未体现"），
    而非孤立出现或用于编造借口。
    未使用该标注时视为通过。
    """
    if "文献未体现" not in text:
        return True

    # "文献未体现" 必须关联到框架节点，不能孤立出现
    # 匹配: **节点**：...文献未体现 或 节点：...文献未体现
    # .*? 容忍节点值内的嵌套加粗/子标签（如 **局限**：**检测限：文献未体现**）
    return bool(re.search(
        r"(?:\*\*[^*]+\*\*|结论|局限|展望|关键数据|关键结果|主要观点|实验设计|计算方法|研究脉络)[：:].*?文献未体现",
        text
    ))


def _check_non_academic_chart(text: str) -> bool:
    """PRD 7.3 + F6 验收标准：非学术图表拒识格式。

    若输出判定为"不是学术图表"（触发时），格式必须包含：
      ① 标题"该图片不是学术图表"
      ② 副标题"请截取文献内的图表进行上传"
    未触发拒识（正常学术图表解读）时视为通过。
    """
    is_rejected = "该图片不是学术图表" in text or "不是学术图表" in text
    if not is_rejected:
        return True

    has_title = "该图片不是学术图表" in text
    has_subtitle = "请截取文献内的图表进行上传" in text

    return has_title and has_subtitle


# ─── 检查引擎 ───────────────────────────────────────────────

def check_module(text: str, module: str) -> list[dict]:
    """对单个模块的输出运行全部规则"""
    all_rules = make_rules()
    rules = all_rules.get(module, [])
    results = []

    for name, check_fn, severity in rules:
        try:
            passed = check_fn(text)
        except Exception as e:
            passed = False
            results.append({
                "rule": name,
                "pass": False,
                "severity": severity,
                "error": str(e),
            })
            continue

        results.append({
            "rule": name,
            "pass": passed,
            "severity": severity,
        })

    return results


def check_file(data: dict) -> dict:
    """检查一个文件的所有模块输出"""
    file_results = {"file": data.get("file", "unknown"), "modules": {}}
    total = 0
    pass_count = 0
    error_count = 0

    for module in ["main", "overview", "structure", "terms", "chart"]:
        text = data.get(module, "")
        if not text:
            continue
        module_results = check_module(text, module)
        file_results["modules"][module] = module_results
        total += len(module_results)
        pass_count += sum(1 for r in module_results if r["pass"])
        # 统计 error 级别的失败数（不计 warn）
        error_count += sum(
            1 for r in module_results
            if not r["pass"] and r["severity"] == "error"
        )

    file_results["summary"] = {
        "total": total,
        "pass": pass_count,
        "fail": total - pass_count,
        "errors": error_count,
    }
    return file_results


# ─── 报告输出 ───────────────────────────────────────────────

def print_report(all_results: list[dict]):
    """打印人类可读的报告"""
    grand_total = 0
    grand_pass = 0
    grand_errors = 0

    for file_result in all_results:
        s = file_result["summary"]
        grand_total += s["total"]
        grand_pass += s["pass"]
        grand_errors += s.get("errors", 0)

        fail = s["fail"]
        errors = s.get("errors", 0)
        warns = fail - errors

        parts = []
        if fail == 0:
            parts.append("✅ 全部通过")
        else:
            if errors > 0:
                parts.append(f"❌ {errors} 项 error")
            if warns > 0:
                parts.append(f"⚠️ {warns} 项 warn")

        print(f"\n{'='*70}")
        print(f"📄 {file_result['file']}")
        print(f"   通过 {s['pass']}/{s['total']}  |  {' · '.join(parts)}")

        for module, rules in file_result["modules"].items():
            failed = [r for r in rules if not r["pass"]]
            if not failed:
                continue

            print(f"\n  📋 {MODULE_NAMES.get(module, module)}")
            for r in failed:
                icon = "❌" if r["severity"] == "error" else "⚠️"
                print(f"    {icon} {r['rule']}")

    grand_fail = grand_total - grand_pass
    print(f"\n{'='*70}")
    print(f"📊 总计: {grand_pass}/{grand_total} 通过, "
          f"{grand_fail} 失败 (含 {grand_errors} 项 error, {grand_fail - grand_errors} 项 warn)")
    print(f"{'='*70}\n")


# ─── 入口 ───────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("用法: python tests/l1_checks.py <output.json | output_dir/>")
        print("示例: python tests/l1_checks.py tests/outputs/2026-06-21.json")
        sys.exit(1)

    path = Path(sys.argv[1])
    json_files: list[Path] = []

    if path.is_dir():
        json_files = sorted(path.glob("*.json"))
    elif path.is_file():
        json_files = [path]
    else:
        print(f"错误: 路径不存在 — {path}")
        sys.exit(1)

    if not json_files:
        print("没有找到 JSON 文件")
        sys.exit(0)

    all_results = []
    for f in json_files:
        try:
            with open(f, "r", encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as e:
            print(f"⚠️ 跳过 {f.name}: {e}")
            continue

        # 支持单个文件对象和包含多个文件的数组
        items = data if isinstance(data, list) else [data]
        for item in items:
            all_results.append(check_file(item))

    print_report(all_results)

    # 仅 error 级别失败时返回非 0（warn 不影响退出码）
    has_errors = any(
        any(not r["pass"] and r["severity"] == "error"
            for rules in fr["modules"].values()
            for r in rules)
        for fr in all_results
    )
    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()
