"use client";

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";

type Tab = "overview" | "structure" | "terms" | "chart";
type Subject =
  | "电化学"
  | "有机化学"
  | "无机化学"
  | "计算化学"
  | "分析化学"
  | "高分子";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "文献速览" },
  { key: "structure", label: "框架梳理" },
  { key: "terms", label: "术语解释" },
  { key: "chart", label: "图表解读" },
];

const TAB_ICONS: Record<Tab, string> = {
  overview: "📄",
  structure: "🧩",
  terms: "📝",
  chart: "📊",
};

const SUBJECTS: Subject[] = [
  "电化学",
  "有机化学",
  "无机化学",
  "计算化学",
  "分析化学",
  "高分子",
];

export default function Home() {
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [paperText, setPaperText] = useState<string | null>(null);
  const [paperTitle, setPaperTitle] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [userQuestion, setUserQuestion] = useState<string>("");
  const [mainCollapsed, setMainCollapsed] = useState(false);

  // 主 Prompt 分析
  const [mainResult, setMainResult] = useState<string | null>(null);
  const [mainLoading, setMainLoading] = useState(false);
  const [mainRequested, setMainRequested] = useState(false); // 本次会话是否已点「分析需求」，不缓存

  // 子模块结果
  const [results, setResults] = useState<Record<Tab, string | null>>({
    overview: null,
    structure: null,
    terms: null,
    chart: null,
  });
  const [loading, setLoading] = useState<Record<Tab, boolean>>({
    overview: false,
    structure: false,
    terms: false,
    chart: false,
  });

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tabSectionRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<Record<Tab, boolean>>({ overview: false, structure: false, terms: false, chart: false });
  // 主分析并发控制：ref 版 mainLoading（供 useEffect 读最新值，避免闭包陈旧）+ AbortController（切换分支取消旧请求）
  const mainLoadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const selectedSubjectRef = useRef(selectedSubject);
  selectedSubjectRef.current = selectedSubject; // 始终保持同步

  // 图表解读状态（提升到父组件，切换 Tab 不丢失）
  const [chartResult, setChartResult] = useState<string | null>(null);
  const [chartImage, setChartImage] = useState<string | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [chartPending, setChartPending] = useState<{ dataUrl: string; mimeType: string } | null>(null);

  const CACHE_KEY = "chemlit-cache";

  // 页面加载时检测是否有缓存
  const [hasCache, setHasCache] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cache = JSON.parse(raw);
        if (cache.paperText) setHasCache(true);
      }
    } catch { /* ignore */ }
  }, []);

  // 恢复缓存
  const restoreCache = useCallback(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const cache = JSON.parse(raw);
      if (cache.paperText) {
        setPaperText(cache.paperText);
        setPaperTitle(cache.paperTitle || "");
        setSelectedSubject(cache.selectedSubject || null);
        setUserQuestion(typeof cache.userQuestion === "string" ? cache.userQuestion : "");
        // 类型守卫：防止旧版本/损坏的缓存中 mainResult 为对象导致 [object Object] 渲染异常
        setMainResult(typeof cache.mainResult === "string" ? cache.mainResult : null);
        setMainCollapsed(false); // 恢复后默认展开
        setMainRequested(!!cache.userQuestion); // 上次确实输入过问题才解锁功能Tab
        if (cache.results && typeof cache.results === "object" && !Array.isArray(cache.results)) {
          // 确保每个 results 值都是字符串
          const safe: Record<string, string | null> = {};
          for (const [k, v] of Object.entries(cache.results)) {
            safe[k] = typeof v === "string" ? v : null;
          }
          setResults(safe as Record<Tab, string | null>);
        }
        if (cache.chartResult) setChartResult(typeof cache.chartResult === "string" ? cache.chartResult : null);
        // 继续上次文献 → 恢复到上次停留的 tab
        if (cache.activeTab && typeof cache.activeTab === "string") setActiveTab(cache.activeTab as Tab);
        // 恢复图表图片（降级写入时可能不存在，正常）
        if (cache.chartImage && typeof cache.chartImage === "string") setChartImage(cache.chartImage);
        setHasCache(false);
      }
    } catch { /* ignore */ }
  }, []);

  // 状态变化时写入缓存（仅在有实际内容时写入，防止上传过渡期空值覆盖有效缓存）
  useEffect(() => {
    if (!paperText) return;
    const hasContent = mainResult
      || Object.values(results).some(r => r !== null)
      || chartResult
      || userQuestion.trim()
      || selectedSubject;
    if (!hasContent) return;

    const data = {
      paperText, paperTitle, selectedSubject, userQuestion,
      mainResult, results, chartResult, chartImage, activeTab,
    };

    // 先尝试完整写入（含图表 base64）
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      return;
    } catch (e) {
      // 只有配额超限才降级，其他错误（如 localStorage 损坏）忽略本次写入
      if (!(e instanceof DOMException) || e.name !== "QuotaExceededError") return;
    }

    // 降级：去掉图表图片，至少保留文字结果
    try {
      const { chartImage: _, ...withoutImage } = data;
      localStorage.setItem(CACHE_KEY, JSON.stringify(withoutImage));
    } catch { /* 降级也失败则放弃 */ }
  }, [paperText, paperTitle, selectedSubject, userQuestion, mainResult, results, chartResult, chartImage, activeTab]);

  // 上传 PDF
  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    // 开始上传新文献 → 立即隐藏"继续上次文献"按钮，清除旧缓存
    setHasCache(false);
    try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
    setResults({ overview: null, structure: null, terms: null, chart: null });
    setMainResult(null);
    setMainRequested(false);
    setActiveTab("overview"); // 分析新文献 → 默认切换到文献速览 Tab
    // 取消正在进行的分析请求（上传新 PDF 时中断旧分析）
    abortRef.current?.abort();
    abortRef.current = null;
    mainLoadingRef.current = false;
    // 注意：不清除 selectedSubject/userQuestion/chartResult/chartImage/chartError/chartPending
    // 因为这些会触发缓存 effect 把旧有效缓存覆盖成空值，导致"继续上次文献"恢复不出来

	    try {
	      // 浏览器端 PDF 解析（pdf.js），绕过 Vercel 4.5MB 请求体限制
	      const pdfjsLib = await import("pdfjs-dist");
	      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

	      const arrayBuffer = await file.arrayBuffer();
	      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

	      if (pdf.numPages > 30) {
	        throw new Error(`PDF 共 ${pdf.numPages} 页，超过 30 页限制，请上传更短的文献`);
	      }

	      const pageTexts: string[] = [];
	      for (let i = 1; i <= pdf.numPages; i++) {
	        const page = await pdf.getPage(i);
	        const content = await page.getTextContent();
	        const text = content.items
	          .map((item) => ("str" in item ? (item as { str: string }).str : ""))
	          .join(" ");
	        pageTexts.push(text);
	      }
	      const fullText = pageTexts.join("\n\n");

	      if (!fullText.trim()) {
	        throw new Error("PDF 中未能提取到文字，可能是扫描版 PDF");
	      }

	      // 发送提取后的文本（而非 PDF 文件），轻松通过 Vercel 限制
	      const res = await fetch("/api/upload", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({ text: fullText, title: file.name }),
	      });
	      if (!res.ok) {
	        const errText = await res.text().catch(() => "");
	        throw new Error(errText || `上传失败 (${res.status})`);
	      }
	      const data = await res.json();
	      setPaperText(data.text);
	      setPaperTitle(data.title);
	    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type === "application/pdf" || file?.name.endsWith(".pdf")) {
        handleFile(file);
      } else {
        setError("仅支持 PDF 文件");
      }
    },
    [handleFile]
  );

  // 主 Prompt 分析
  const runMainAnalysis = useCallback(async (force = false) => {
    if (!paperText) return;
    if (!userQuestion.trim()) return; // 必须输入需求
    // 输入校验：拒绝纯数字/纯符号/乱码/键盘乱敲
    // 通过条件（满足任一即可）：① ≥2个中文字 ② ≥3个英文字母且含元音 ③ ≥2个大写字母（缩写如XRD/SEM） ④ ≥2个英文字母（兜底，如"pH值"）
    const hasChinese = /[一-鿿].*[一-鿿]/.test(userQuestion);
    const hasEnglishWord = /(?=.*[aeiouAEIOU])[a-zA-Z]{3,}/.test(userQuestion);
    const hasAbbr = /[A-Z]{2,}/.test(userQuestion);
    const hasMinLetters = /[a-zA-Z].*[a-zA-Z]/.test(userQuestion) && /[一-鿿]/.test(userQuestion);
    if (!hasChinese && !hasEnglishWord && !hasAbbr && !hasMinLetters) {
      setError("请输入有效的问题（需包含中文或英文单词，不支持纯数字/符号/乱码）");
      return;
    }
    if (mainLoadingRef.current) return;

    // 取消上一个 in-flight 请求
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    mainLoadingRef.current = true;
    setMainLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperText, type: "main" as const, userQuestion,
          selectedSubject: selectedSubjectRef.current, // 读 ref 最新值（非闭包陈旧值）
          force,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `分析失败 (${res.status})`);
      }
      const data = await res.json();
      setMainResult(data.result);
      setMainCollapsed(false); // 首次分析/重新分析自动展开
      setMainRequested(true);
    } catch (e) {
      // AbortError：请求被取消（如切换分支），不显示错误
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      mainLoadingRef.current = false;
      setMainLoading(false);
      abortRef.current = null;
    }
  }, [paperText, userQuestion]); // 注意：不依赖 selectedSubject——改用 selectedSubjectRef

  // 子模块分析
  const analyze = useCallback(
    async (tab: Tab, force = false) => {
      if (!paperText) return;
      if (!mainRequested) return; // 必须点过「分析需求」
      if (!userQuestion.trim()) return; // 必须有输入问题
      if (tab === "chart") return;

      // 防重复请求：ref 同步防重 + state 用于 UI
      if (loadingRef.current[tab]) return;
      loadingRef.current[tab] = true;
      setLoading((prev) => ({ ...prev, [tab]: true }));
      setError(null);

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paperText,
            type: tab,
            userQuestion: userQuestion || undefined,
            selectedSubject: selectedSubject || undefined,
            force,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `分析失败 (${res.status})`);
        }
        const data = await res.json();
        setResults((prev) => ({ ...prev, [tab]: data.result }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "分析失败");
      } finally {
        loadingRef.current[tab] = false;
        setLoading((prev) => ({ ...prev, [tab]: false }));
      }
    },
    [paperText, userQuestion, mainRequested]
  );

  const switchTab = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      setMainCollapsed(true); // 自动收起主分析，让用户直接看到 Tab 内容
      setError(null);
      if (tab !== "chart" && paperText && !results[tab]) {
        analyze(tab);
      }
    },
    [paperText, results, analyze]
  );

  // Tab 切换后滚动——确保内容区从顶部开始显示
  useLayoutEffect(() => {
    const el = tabSectionRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 120;
    window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
  }, [activeTab]);

  // 换一篇：重置全部（保留缓存，方便用户"继续上次文献"恢复）
  const resetAll = useCallback(() => {
    setPaperText(null);
    setPaperTitle("");
    setSelectedSubject(null);
    setUserQuestion("");
    setMainResult(null);
    setMainRequested(false);
    setResults({ overview: null, structure: null, terms: null, chart: null });
    setChartResult(null);
    setChartImage(null);
    setChartError(null);
    setChartPending(null);
    loadingRef.current = { overview: false, structure: false, terms: false, chart: false };
    // 取消正在进行的分析请求 + 重置主分析并发状态
    abortRef.current?.abort();
    abortRef.current = null;
    mainLoadingRef.current = false;
    // 重新检测缓存——如果 localStorage 有数据就显示"继续上次文献"
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cache = JSON.parse(raw);
        setHasCache(!!cache.paperText);
      }
    } catch { /* ignore */ }
  }, []);

  // 图表解读 —— 选择图片 → 预览确认
  const handleChartSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!mainRequested) {
      setChartError("请先在顶部输入框中输入你的问题并点击「分析需求」");
      return;
    }

    setChartError(null);

    const MAX_DIM = 1600;
    const MAX_BASE64 = 3.5 * 1024 * 1024;

    const reader = new FileReader();
    reader.onload = () => {
      const originalDataUrl = reader.result as string;

      // 先尝试加载图片，如果需要缩放则用 canvas 压缩
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;

        if (w <= MAX_DIM && h <= MAX_DIM && originalDataUrl.length <= MAX_BASE64) {
          // 图片尺寸和大小都 OK，直接使用
          setChartPending({ dataUrl: originalDataUrl, mimeType: file.type || "image/png" });
          return;
        }

        // 需要缩放
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setChartPending({ dataUrl: originalDataUrl, mimeType: file.type || "image/png" });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        let mimeType = file.type || "image/png";
        let quality = 0.92;
        let dataUrl = canvas.toDataURL(mimeType, quality);

        if (dataUrl.length > MAX_BASE64) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          mimeType = "image/jpeg";
        }
        if (dataUrl.length > MAX_BASE64) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        }

        if (dataUrl.length > MAX_BASE64) {
          setChartError(`图片经压缩后仍较大（${(dataUrl.length / 1024 / 1024).toFixed(1)}MB），建议截取更小区域或降低截图分辨率后重试`);
          return;
        }

        setChartPending({ dataUrl, mimeType });
      };
      img.onerror = () => {
        setChartError("图片加载失败，请重试");
      };
      img.src = originalDataUrl;
    };
    reader.readAsDataURL(file);
  }, [mainRequested]);

  // 图表解读 —— 确认上传
  const confirmChart = useCallback(async () => {
    if (!chartPending) return;
    setChartLoading(true);
    setChartError(null);
    setChartImage(chartPending.dataUrl);
    setChartPending(null);
    try {
      const base64 = chartPending.dataUrl.split(",")[1];
      const res = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: chartPending.mimeType, paperText, userQuestion }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `图表解读失败 (${res.status})`);
      }
      const data = await res.json();
      setChartResult(data.result);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : "图表解读失败");
    } finally {
      setChartLoading(false);
    }
  }, [chartPending, paperText, userQuestion]);

  // 图表解读 —— 取消
  const cancelChart = useCallback(() => {
    setChartPending(null);
    const input = document.getElementById("chart-input") as HTMLInputElement;
    if (input) input.value = "";
  }, []);

  // ====== 首页 Landing ======
  if (!showWorkspace) {
    return <LandingPage onStart={() => setShowWorkspace(true)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-cyan-200 to-teal-100 animate-[workspace-enter_0.4s_ease-out]">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {mainRequested && (
              <button
                onClick={resetAll}
                className="text-base font-medium text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1"
              >
                ← 重新上传
              </button>
            )}
            <div>
              <h1
                className="text-xl font-bold text-slate-900 cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => setShowWorkspace(false)}
              >
                ChemLit AI
              </h1>
              <p className="text-xs text-slate-500">化学文献智能拆解助手</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {paperText && (
              <>
                <span className="text-xs text-green-600 bg-green-50 px-3 py-1 rounded-full">
                  已加载 · {(paperTitle || "无标题").slice(0, 20)}
                </span>
                <button
                  onClick={resetAll}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                >
                  换一篇
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 功能 Tab（点击「分析需求」后显示） */}
      {mainRequested && paperText && (
      <div ref={tabBarRef} className="max-w-5xl mx-auto px-4 pt-4 sticky top-[73px] z-10 pb-6">
        <div className="flex gap-1 bg-slate-100 p-1.5 rounded-xl">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                if (!paperText) return;
                switchTab(tab.key);
              }}
              disabled={!paperText}
              className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5
                ${!paperText
                  ? "text-slate-300 cursor-not-allowed"
                  : activeTab === tab.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
            >
              <span>{TAB_ICONS[tab.key]}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {loading[tab.key] && (
                <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              )}
              {results[tab.key] && !loading[tab.key] && (
                <span className="text-green-500 text-xs">✓</span>
              )}
            </button>
          ))}
        </div>
      </div>
      )}

      <main className="max-w-5xl mx-auto px-4 pt-8 pb-6">
        {/* ====== 问题输入框（始终可见） ====== */}
        <section className="mb-10">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-sm font-medium text-slate-700 mb-3">
              你有什么想从这篇文献中了解的？
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={userQuestion}
                onChange={(e) => setUserQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !mainLoading && paperText && userQuestion.trim()) runMainAnalysis(); }}
                placeholder={paperText
                  ? "例如：这篇文献的实验方法我能复现吗？和我的课题方向相关吗？"
                  : "上传 PDF 后输入你的问题"}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 bg-white"
              />
              <button
                onClick={() => runMainAnalysis()}
                disabled={mainLoading || !paperText || !userQuestion.trim()}
                className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {mainLoading ? "分析中..." : "分析需求 →"}
              </button>
            </div>
          </div>
        </section>

        {/* ====== 上传区域 + 分支选择（点击「分析需求」前始终显示） ====== */}
        {!mainRequested && (
          <section className="mb-10">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* 左侧：上传区 */}
              <div className="lg:w-5/12 flex flex-col">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border border-slate-200 rounded-2xl p-8 text-center cursor-pointer transition-colors flex-1 flex flex-col items-center justify-center shadow-sm
                    ${uploading
                      ? "border-blue-400 bg-blue-50"
                      : "hover:border-blue-400 hover:bg-blue-50 bg-white"
                    }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFile(file);
                    }}
                  />
                  {uploading ? (
                    <div>
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-slate-600">正在解析 PDF...</p>
                    </div>
                  ) : paperText ? (
                    <div>
                      <div className="text-4xl mb-3">📄</div>
                      <p className="text-base font-medium text-green-700 mb-1">
                        PDF 已加载 · {(paperTitle || "无标题").slice(0, 20)}
                      </p>
                      <p className="text-sm text-slate-400">
                        输入问题后点击「分析需求」开始分析
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-4xl mb-3">📄</div>
                      <p className="text-base font-medium text-slate-700 mb-1">
                        拖转 PDF 到此处，或点击上传
                      </p>
                      <p className="text-sm text-slate-400">
                        支持中英文化学文献 · 最多 30 页
                      </p>
                    </div>
                  )}
                </div>

                {hasCache && (
                  <div className="mt-3 text-center">
                    <button
                      onClick={restoreCache}
                      className="text-sm text-slate-700 hover:text-blue-600 underline font-medium"
                    >
                      继续上次文献 →
                    </button>
                  </div>
                )}
              </div>

              {/* 右侧：化学分支选择 */}
              <div className="lg:w-7/12 flex flex-col">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex-1 flex flex-col justify-center">
                <p className="text-sm font-medium text-slate-700 mb-1">选择化学分支</p>
                <p className="text-xs text-slate-400 mb-3">
                  选择后 AI 将更聚焦该方向的术语和方法进行分析，不选则自动识别
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUBJECTS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        const newSubject = s === selectedSubject ? null : s;
                        setSelectedSubject(newSubject);
                        // 分析中切换分支 → 取消当前分析，等待用户重新点击「分析需求」
                        if (mainLoadingRef.current) {
                          abortRef.current?.abort();
                          abortRef.current = null;
                          mainLoadingRef.current = false;
                          setMainLoading(false);
                        }
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all
                        ${s === selectedSubject
                          ? "bg-blue-600 text-white shadow-md"
                          : "bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-slate-700 border border-slate-200"
                        }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-3 underline hover:no-underline"
            >
              关闭
            </button>
          </div>
        )}

        {/* ====== PDF 上传后 + 已点分析需求：主 Prompt 结果 + Tab 区 ====== */}
        {mainRequested && paperText && (
          <section>
            {/* 主 Prompt 结果（可折叠，点 Tab 后自动折叠） */}
            {mainResult && (
              <div className="bg-blue-50/80 rounded-2xl border border-blue-100 p-6 mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-medium text-blue-700">
                    📋 分析结果
                  </span>
                  <span className="text-xs text-blue-400">
                    基于你的提问，AI 已分析文献并给出建议
                  </span>
<button
                    onClick={() => setMainCollapsed(!mainCollapsed)}
                    className="text-xs px-3 py-1 rounded-lg bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {mainCollapsed ? "展开 ▼" : "收起 ▲"}
                  </button>
                </div>
                {!mainCollapsed && (
                  <div className="max-w-none">
                    <MarkdownRenderer text={mainResult} onTabClick={switchTab} />
                  </div>
                )}
              </div>
            )}

            {/* Content Panel */}
            <div ref={tabSectionRef} className="bg-blue-50/80 rounded-2xl border border-blue-100 p-6 md:p-8 min-h-[400px] scroll-mt-40">
              {loading[activeTab] && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
                  <p>
                    {activeTab === "overview" && "正在生成文献速览..."}
                    {activeTab === "structure" && "正在梳理文献框架..."}
                    {activeTab === "terms" && "正在提取并解释术语..."}
                  </p>
                </div>
              )}

              {!loading[activeTab] && results[activeTab] && (
                <div className="max-w-none">
                  <MarkdownRenderer text={results[activeTab]!} onTabClick={switchTab} />
                </div>
              )}

              {!loading[activeTab] && !results[activeTab] && activeTab !== "chart" && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <p className="text-lg">
                    {userQuestion.trim()
                      ? "点击上方 Tab 开始查看详细分析"
                      : "请先输入问题并点击「分析需求」"}
                  </p>
                  <p className="text-sm mt-1">分析完成后 Tab 上会有 ✓ 标记</p>
                </div>
              )}

              {/* 图表解读始终挂载，切换 Tab 不丢失状态 */}
              <div style={{ display: activeTab === "chart" ? "block" : "none" }}>
                <ChartUploadTab
                  onTabClick={switchTab}
                  paperText={paperText}
                  userQuestion={userQuestion}
                  chartResult={chartResult}
                  chartImage={chartImage}
                  chartLoading={chartLoading}
                  chartError={chartError}
                  chartPending={chartPending}
                  onChartSelect={handleChartSelect}
                  onConfirmChart={confirmChart}
                  onCancelChart={cancelChart}
                />
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

/* ====== Markdown 渲染 ====== */

const TAB_NAME_MAP: Record<string, Tab> = {
  "文献速览": "overview",
  "框架梳理": "structure",
  "术语解释": "terms",
  "图表解读": "chart",
};

function MarkdownRenderer({ text, onTabClick }: { text: string; onTabClick?: (tab: Tab) => void }) {
  const lines = text.split("\n");
  const els: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let i = 0;

  function flushList() {
    if (listItems.length > 0) {
      els.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 my-3 space-y-1">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    if (trimmed.startsWith("### ")) {
      flushList();
      els.push(
        <h3 key={i} className="text-lg font-semibold text-slate-900 mt-6 mb-2">
          {renderInlineWithTabs(trimmed.slice(4), onTabClick)}
        </h3>
      );
    } else if (trimmed.startsWith("## ")) {
      flushList();
      els.push(
        <h2 key={i} className="text-xl font-bold text-slate-900 mt-8 mb-3 border-b border-slate-100 pb-1">
          {renderInlineWithTabs(trimmed.slice(3), onTabClick)}
        </h2>
      );
    } else if (trimmed.startsWith("# ")) {
      flushList();
      els.push(
        <h1 key={i} className="text-2xl font-bold text-slate-900 mt-8 mb-4">
          {renderInlineWithTabs(trimmed.slice(2), onTabClick)}
        </h1>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(<li key={i}>{renderInlineWithTabs(trimmed.slice(2), onTabClick)}</li>);
    } else if (trimmed === "") {
      flushList();
      els.push(<div key={i} className="h-2" />);
    } else {
      flushList();
      // 缩进层级：加左侧色条 + 左内边距，体现框架的递进逻辑
      const indentLevel = Math.min(indent, 16);
      const indentStyle = indent > 0
        ? { paddingLeft: `${indentLevel * 2 + 8}px`, borderLeft: "2px solid #e2e8f0" }
        : {};
      els.push(
        <p key={i} className="text-slate-700 leading-relaxed my-2" style={indentStyle}>
          {renderInlineWithTabs(trimmed, onTabClick)}
        </p>
      );
    }
    i++;
  }
  flushList();
  return <>{els}</>;
}

function renderInlineWithTabs(text: string, onTabClick?: (tab: Tab) => void) {
  // 先按 **粗体** 分割（确保 ** 配对不被 【】 切断），再在每个片段内处理 【】 按钮
  const boldPattern = /(\*\*[^*]+\*\*)/g;
  const boldSegments = text.split(boldPattern);
  return boldSegments.map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      // 粗体内容：先剥掉 **，再内部渲染 【】 按钮
      const inner = seg.slice(2, -2);
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {renderTabButtons(inner, onTabClick)}
        </strong>
      );
    }
    // 非粗体：直接渲染 【】 按钮
    return <span key={i}>{renderTabButtons(seg, onTabClick)}</span>;
  });
}

function renderTabButtons(text: string, onTabClick?: (tab: Tab) => void) {
  const tabPattern = /(【[^】]+】)/g;
  const parts = text.split(tabPattern);
  return parts.map((part, j) => {
    const inner = part.match(/^【(.+)】$/);
    if (inner && onTabClick) {
      const tabKey = TAB_NAME_MAP[inner[1]];
      if (tabKey) {
        return (
          <button
            key={j}
            onClick={() => onTabClick(tabKey)}
            className="inline text-blue-600 hover:text-blue-800 cursor-pointer font-medium"
          >
            {part}
          </button>
        );
      }
    }
    return <span key={j}>{part}</span>;
  });
}

/* ====== 图表解读 Tab ====== */

function ChartUploadTab({
  onTabClick,
  paperText,
  userQuestion,
  chartResult,
  chartImage,
  chartLoading,
  chartError,
  chartPending,
  onChartSelect,
  onConfirmChart,
  onCancelChart,
}: {
  onTabClick: (tab: Tab) => void;
  paperText: string | null;
  userQuestion: string;
  chartResult: string | null;
  chartImage: string | null;
  chartLoading: boolean;
  chartError: string | null;
  chartPending: { dataUrl: string; mimeType: string } | null;
  onChartSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmChart: () => void;
  onCancelChart: () => void;
}) {
  const isRejected = chartResult?.includes("该图片不是学术图表");
  const rejectText = isRejected
    ? chartResult!.replace(/^\*\*该图片不是学术图表\*\*\s*/, "").trim()
    : "";
  const chartWarning = "若上传图表和当前文献无关，图表解析准确度会明显下降，建议上传本文内图表";
  return (
    <div>
      {!userQuestion.trim() ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <p className="text-lg">请先输入问题并点击「分析需求」</p>
          <p className="text-sm mt-1">之后再切换到图表解读上传图表</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500 mb-4">
            请先从文献中截取你要了解的图表，然后上传
          </p>
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors
          ${chartLoading ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 bg-white"}`}
      >
        <input
          type="file"
          accept="image/*"
          className="hidden"
          id="chart-input"
          onChange={onChartSelect}
        />
        <label htmlFor="chart-input" className="cursor-pointer block">
          <div className="text-3xl mb-2">📸</div>
          <p className="text-slate-600 font-medium">上传图表截图</p>
          <p className="text-sm text-slate-400 mt-1">
            支持机理图/数据图/谱图/表格等文献图表
          </p>
        </label>
      </div>

      <p className="text-xs text-slate-400 mt-2 text-center">
        提示：截图文件过大时，刷新页面后再次点击本模块可能无法显示图表、仅有文字解读
      </p>

      {/* 确认上传 */}
      {chartPending && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <img
            src={chartPending.dataUrl}
            alt="预览"
            className="max-h-48 rounded-lg border border-blue-200 mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={onConfirmChart}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              确认上传
            </button>
            <button
              onClick={onCancelChart}
              className="px-4 py-1.5 bg-white text-slate-600 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {chartLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-3" />
          <span className="text-slate-500">AI 正在解读图表...</span>
        </div>
      )}

      {chartError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {chartError}
        </div>
      )}

      {/* 图表 + 解读：桌面端左右并排，移动端上下 */}
      {isRejected ? (
        <>
          {chartImage && (
            <div className="mt-6">
              <p className="text-sm font-medium text-slate-600 mb-3">📷 你上传的图表</p>
              <img
                src={chartImage}
                alt="上传的图表"
                className="max-w-full rounded-xl border border-slate-200"
              />
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-semibold text-red-700">该图片不是学术图表</p>
                {rejectText && (
                  <p className="text-xs text-red-600 mt-1">{rejectText}</p>
                )}
              </div>
            </div>
          )}
        </>
      ) : chartImage && chartResult ? (
        <div className="mt-6 flex flex-col lg:flex-row gap-6">
          <div className="lg:w-1/2 lg:sticky lg:top-28 lg:self-start">
            <p className="text-sm font-medium text-slate-600 mb-3">📷 你上传的图表</p>
            <img
              src={chartImage}
              alt="上传的图表"
              className="max-w-full max-h-[calc(100vh-8rem)] object-contain rounded-xl border border-slate-200"
            />
            <p className="text-xs text-slate-400 mt-2">{chartWarning}</p>
          </div>
          <div className="lg:w-1/2 p-5 bg-slate-50 rounded-xl">
            <p className="text-sm font-medium text-slate-600 mb-3">📝 AI 解读</p>
            <MarkdownRenderer text={chartResult!} onTabClick={onTabClick} />
          </div>
        </div>
      ) : (
        <>
          {chartImage && (
            <div className="mt-6">
              <p className="text-sm font-medium text-slate-600 mb-3">📷 你上传的图表</p>
              <img
                src={chartImage}
                alt="上传的图表"
                className="max-w-full rounded-xl border border-slate-200"
              />
              <p className="text-xs text-slate-400 mt-2">{chartWarning}</p>
            </div>
          )}
          {chartResult && (
            <div className="mt-6 p-5 bg-slate-50 rounded-xl">
              <p className="text-sm font-medium text-slate-600 mb-3">📝 AI 解读</p>
              <MarkdownRenderer text={chartResult!} onTabClick={onTabClick} />
            </div>
          )}
        </>
      )}
        </>
      )}
    </div>
  );
}

/* ====== 首页 Landing 组件 ====== */

function LandingPage({ onStart }: { onStart: () => void }) {
  const FEATURES = [
    { icon: "📄", title: "文献速览", desc: "快速梳理研究背景、方法、核心结论与创新点，帮你判断文献是否值得精读", gradient: "from-blue-50 to-cyan-50", border: "border-blue-200", preview: "一句话总结：通过实验与模拟揭示了胆汁盐分子结构差异如何决定其在脂质消化中的不同功能\n\n创新点：首次多尺度表征胆汁盐与脂滴表面的相互作用；建立结构-界面行为-消化功能的关联\n\n精读建议：推荐精读，该文献对理解界面化学有重要参考价值……" },
    { icon: "🧩", title: "框架梳理", desc: "拆解文献逻辑结构，标注段落递进关系与论证脉络，为深度阅读建立清晰路标", gradient: "from-indigo-50 to-blue-50", border: "border-indigo-200", preview: "研究问题 → 研究目标 → 文献背景 → 实验设计（材料 / 方法 / 表征）→ 关键数据 → 结论 → 局限\n\n每个节点一句话概括，层级缩进展示，一眼看清文章骨架……" },
    { icon: "📝", title: "术语解释", desc: "用通俗中文解释专业术语与缩写，帮你建立化学学科词汇体系，扫清阅读障碍", gradient: "from-teal-50 to-emerald-50", border: "border-teal-200", preview: "HOMO / LUMO 【计算化学】\n最高占据分子轨道与最低未占分子轨道，决定分子的电子给受能力。\n\nTurnover Frequency 【催化】\n单位时间内每个活性位点完成的催化循环次数，衡量催化剂效率的关键指标……" },
    { icon: "📊", title: "图表解读", desc: "AI 识别并解读文献中的机理图、数据图、谱图与表格，不再对着图表发愁", gradient: "from-sky-50 to-cyan-50", border: "border-sky-200", preview: "XRD 图谱：横坐标 2θ，纵坐标衍射强度。2θ=13.5° 处新衍射峰表明形成正交钙钛矿相。\n\nSEM 图像：薄膜表面致密均匀，晶粒尺寸约 500nm，无针孔缺陷。\n\n上传文献中的图表截图即可解读……" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-cyan-100 to-teal-50 animate-[landing-enter_0.3s_ease-out]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-16">
          <h1 className="text-2xl font-bold text-blue-900">ChemLit AI</h1>
          <p className="text-sm text-blue-500">化学文献智能拆解助手</p>
        </div>

        <div className="flex gap-1 bg-white/60 backdrop-blur-sm p-1.5 rounded-xl mb-16 max-w-lg mx-auto">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex-1 px-3 py-2.5 rounded-lg text-sm text-slate-300 font-medium text-center flex items-center justify-center gap-1.5"
            >
              <span>{f.icon}</span>
              <span className="hidden sm:inline">{f.title}</span>
            </div>
          ))}
        </div>

        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold text-slate-900 mb-4">ChemLit AI</h2>
          <p className="text-lg text-slate-500 mb-6">化学文献智能拆解助手</p>
          <p className="text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
            上传一篇化学文献，输入你关心的问题，AI 帮你解答问题、判断文献是否值得精读。<br />
            同时梳理文章框架、解释专业术语、解读复杂图表，让你带着清晰的脉络进入深度阅读。
          </p>
        </div>

        <div className="text-center mb-20">
          <button
            onClick={onStart}
            className="px-10 py-3.5 bg-blue-600 text-white text-lg font-medium rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
          >
            开始使用 →
          </button>
        </div>

        {/* 功能展示卡片（横向可滑动，参考 OTOMEHUB 风格） */}
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            <span className="text-sm font-medium text-slate-500 whitespace-nowrap">📌 核心功能</span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
          </div>
          <div className="overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory">
            <div className="flex gap-4 min-w-max justify-center">
              {FEATURES.map((card) => (
                <div
                  key={card.title}
                  className={`bg-gradient-to-br ${card.gradient} rounded-2xl border ${card.border} p-5 w-72 flex-shrink-0 flex flex-col hover:shadow-lg hover:-translate-y-1 transition-all duration-300 snap-start`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-2xl">{card.icon}</div>
                    <p className="text-base font-semibold text-slate-800">{card.title}</p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">{card.desc}</p>
                  <div className="bg-white/70 rounded-lg p-3 text-xs text-slate-600 leading-relaxed whitespace-pre-line border border-white flex-1 overflow-y-auto max-h-48 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {card.preview}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
