// 浏览器端文本压缩：替代服务端硬截断，保留更多文献内容

export interface CompressOptions {
  maxLength?: number;            // 默认 120000
  removeReferences?: boolean;    // 默认 true
  removeAcknowledgments?: boolean; // 默认 true
  cleanHeadersFooters?: boolean;  // 默认 true
  normalizeWhitespace?: boolean;  // 默认 true
}

export interface CompressResult {
  text: string;
  originalLength: number;
  compressedLength: number;
  reductionPercent: number;
}

// 参考文献章节标题模式（需在文本后半段、独占短行才匹配）
const REF_HEADERS = [
  /^References?\s*$/im,
  /^REFERENCES?\s*$/m,
  /^Bibliography\s*$/im,
  /^BIBLIOGRAPHY\s*$/m,
  /^Literature\s*Cited\s*$/im,
  /^LITERATURE\s*CITED\s*$/m,
  /^Reference\s+and\s+Notes?\s*$/im,
  /^参考文献\s*$/m,
  /^引用文献\s*$/m,
];

// 致谢章节标题模式
const ACK_HEADERS = [
  /^Acknowledgments?\s*$/im,
  /^ACKNOWLEDGMENTS?\s*$/m,
  /^Acknowledgements?\s*$/im,
  /^ACKNOWLEDGEMENTS?\s*$/m,
  /^致谢\s*$/m,
  /^謝辞\s*$/m,
  /^Funding\s*$/im,
  /^FUNDING\s*$/m,
];

// 可能的章节标题（用于定位致谢章节结束位置）
const SECTION_HEADER = /^(?:Abstract|Introduction|Experimental|Method|Result|Discussion|Conclusion|Appendix|Supporting|Supplementary|References?|Bibliography|Acknowledgments?|Author\s+Contribution|Conflict|Declaration|摘要|引言|实验|方法|结果|讨论|结论|附录|参考文献|致谢)/im;

function removeReferencesSection(text: string): string {
  const lowerThird = Math.floor(text.length * 0.6);
  let bestMatch = -1;

  for (const pattern of REF_HEADERS) {
    // 重置 lastIndex（因为有 g 标志的正则）
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // 只在文本后半段匹配，且行长度不超过 80 字符
      if (match.index > lowerThird && match[0].length <= 80) {
        bestMatch = Math.max(bestMatch, match.index);
      }
    }
  }

  if (bestMatch > 0) {
    return text.slice(0, bestMatch).trimEnd();
  }
  return text;
}

function removeAcknowledgmentsSection(text: string): string {
  const half = Math.floor(text.length * 0.5);
  let result = text;

  for (const pattern of ACK_HEADERS) {
    pattern.lastIndex = half;
    const match = pattern.exec(result);
    if (match) {
      // 查找下一个章节标题作为结束边界
      const afterAck = result.slice(match.index + match[0].length);
      const nextSection = afterAck.search(SECTION_HEADER);
      if (nextSection > 0) {
        result = result.slice(0, match.index) + result.slice(match.index + match[0].length + nextSection);
      } else {
        // 没有找到下一个章节，直接截断到此
        result = result.slice(0, match.index);
      }
      break; // 只移除第一个匹配的致谢章节
    }
  }

  return result.trimEnd();
}

function cleanPageHeadersFooters(text: string): string {
  const lines = text.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    // 纯数字（1-4 位，可能是页码）
    if (/^\d{1,4}$/.test(trimmed)) return false;
    // Page X 模式
    if (/^Page\s+\d+/i.test(trimmed)) return false;
    // 极短行（< 3 字符且非中文）
    if (trimmed.length < 3 && !/[一-鿿]/.test(trimmed)) return false;
    return true;
  });
  return filtered.join("\n");
}

function normalizeTextWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")        // 合并水平空白
    .replace(/\n{3,}/g, "\n\n")     // 三个以上换行 → 两个
    .replace(/[ \t]+\n/g, "\n")     // 行尾空白
    .replace(/\n[ \t]+/g, "\n")     // 行首空白
    .trim();
}

function intelligentTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const slice = text.slice(0, maxLength);
  const marker = "\n\n[文本过长，已截断]";
  const minCut = Math.floor(maxLength * 0.7);

  // 1. 尝试在段落边界截断
  const paraBreak = slice.lastIndexOf("\n\n");
  if (paraBreak > minCut) {
    return text.slice(0, paraBreak) + marker;
  }

  // 2. 尝试在句子边界截断
  const sentenceMatch = slice.slice(minCut).search(/[.!?。！？]\s/);
  if (sentenceMatch >= 0) {
    return slice.slice(0, minCut + sentenceMatch + 1) + marker;
  }

  // 3. 在最后一个空格处截断
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > Math.floor(maxLength * 0.8)) {
    return slice.slice(0, lastSpace) + marker;
  }

  // 4. 硬截断
  return slice + marker;
}

export function compressText(
  text: string,
  options: CompressOptions = {}
): CompressResult {
  const {
    maxLength = 120000,
    removeReferences = true,
    removeAcknowledgments = true,
    cleanHeadersFooters = true,
    normalizeWhitespace = true,
  } = options;

  const originalLength = text.length;
  let result = text;

  if (removeReferences) {
    result = removeReferencesSection(result);
  }
  if (removeAcknowledgments) {
    result = removeAcknowledgmentsSection(result);
  }
  if (cleanHeadersFooters) {
    result = cleanPageHeadersFooters(result);
  }
  if (normalizeWhitespace) {
    result = normalizeTextWhitespace(result);
  }
  if (result.length > maxLength) {
    result = intelligentTruncate(result, maxLength);
  }

  return {
    text: result,
    originalLength,
    compressedLength: result.length,
    reductionPercent: Math.round(
      (1 - result.length / originalLength) * 100
    ),
  };
}
