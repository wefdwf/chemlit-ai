# ChemLit AI — 化学文献智能拆解助手

上传化学领域英文学术文献 PDF，AI 自动拆解分析。支持：
- **文献速览**：一句话总结、创新点、方法概述、关键结论、精读建议
- **框架梳理**：研究问题 → 实验设计 → 关键数据 → 结论 → 局限
- **术语解释**：5-10 个核心专业术语通俗解读
- **图表解读**：上传文献中的图表截图，AI 解读谱图/电镜/数据图

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Next.js 16 (App Router + Turbopack) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS 4 |
| AI | DeepSeek v4-pro API |
| PDF 解析 | pdfjs-dist（浏览器端解析） |
| 图表解读 | 千问 VL API |
| 部署 | Vercel + 自定义域名 chemlit.cyou |

## 本地运行

### 1. 环境准备

- Node.js 20+
- npm 10+

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 API Key

创建 `.env.local` 文件（已自动被 .gitignore 排除）：

```env
DEEPSEEK_API_KEY=sk-你的DeepSeek密钥
QWEN_API_KEY=sk-你的千问密钥（可选，图表解读用）
```

DeepSeek API Key 在 [platform.deepseek.com](https://platform.deepseek.com) 获取，充值 ¥10 能用很久——每次分析约 ¥0.11（输入 token），¥10 ≈ 90 次。

### 4. 启动

```bash
npm run dev
```

浏览器打开 http://localhost:3000

### 5. 生产模式

```bash
npm run build
npm run start
```

## 部署

### Vercel（已上线）

线上地址：https://chemlit.cyou

自动部署：推送代码到 GitHub → Vercel 自动重新部署。

> Vercel Hobby 版函数超时 10 秒，本项目通过 `max_tokens=4096` + PDF 30 页限制控制在范围内。若需更长分析时间，可改用 Render。

### Render（备选）

1. 把代码推送到 GitHub 仓库
2. 在 [render.com](https://render.com) 注册
3. 点 **New Web Service** → 选择仓库
4. Build Command: `npm install && npm run build`
5. Start Command: `npm run start`
6. 添加环境变量 `DEEPSEEK_API_KEY`、`QWEN_API_KEY`
7. 点 **Create Web Service**

## 项目结构

```
chemlit-ai/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/route.ts    # AI 文本分析接口
│   │   │   ├── chart/route.ts      # 图表解读接口
│   │   │   └── upload/route.ts     # PDF 上传解析接口
│   │   ├── globals.css             # 全局样式 + Tailwind
│   │   ├── layout.tsx              # 根布局
│   │   └── page.tsx                # 主页面（单页应用，所有交互逻辑）
│   └── lib/
│       ├── prompts.ts              # AI Prompt 模板（v15）
│       └── compressText.ts         # 浏览器端文本压缩
├── package.json
├── tsconfig.json
└── next.config.ts
```

## 后续改进

改进项目后，推送 GitHub → Vercel 自动重新部署。无需额外操作。
