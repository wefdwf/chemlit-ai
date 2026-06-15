import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 增大 API 请求体限制：文献 PDF 和图表截图可能 > 默认 4MB
  // Next.js App Router 中此配置控制 JSON 和 FormData 的上限
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
