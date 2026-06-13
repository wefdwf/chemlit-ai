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
| AI | DeepSeek Chat API |
| PDF 解析 | unpdf |

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

DeepSeek API Key 在 [platform.deepseek.com](https://platform.deepseek.com) 获取，充值后按量计费（约 ¥1/百万 token）。

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

### Render（免费托管，推荐）

1. 把代码推送到 GitHub 仓库
2. 在 [render.com](https://render.com) 注册（GitHub 登录）
3. 点 **New Web Service** → 选择仓库
4. 设置：
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **环境变量**：添加 `DEEPSEEK_API_KEY`
5. 点 **Create Web Service**，3 分钟后上线

Render 免费版 750 小时/月，一个人用绰绰有余。唯一缺点：15 分钟无请求会自动休眠，下次访问需等 30-60 秒冷启动。

### Vercel（不推荐免费版）

Vercel Hobby 版函数超时限制 10 秒，DeepSeek API 调用通常需要 30-60 秒，会频繁超时报错。如需用 Vercel，需升级 Pro（$20/月）。

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
│       └── prompts.ts              # AI Prompt 模板
├── package.json
├── tsconfig.json
└── next.config.ts
```

## 后续改进

改进项目后，推送 GitHub → Render 自动重新部署。无需额外操作。
