# ChemLit AI 项目速览

## 我是谁
应用化学大三学生，转行 AI 产品经理，正在做暑期实习求职项目。

## 项目简介
**ChemLit AI** — 化学文献智能拆解助手。上传化学论文 PDF，AI 自动生成：
1. 文献速览（一句话总结/创新点/方法/结论/精读建议）
2. 框架梳理（研究问题→实验设计→数据→结论→局限）
3. 术语解释（5-10 个化学术语通俗解读）
4. 图表解读（上传谱图截图→AI 解读）
5. 主 Prompt 需求分析（用户提问→AI 结合文献回答+推荐功能板块）

## 技术栈
- Next.js 16.2.6 + TypeScript + Tailwind CSS 4.3
- DeepSeek Chat API（文本+多模态）
- unpdf（PDF 解析）
- 部署目标：Vercel

## 项目路径
`c:\Users\28067\Practice\chemlit-ai`

## 启动命令
```bash
cd c:\Users\28067\Practice\chemlit-ai
npm run dev
# 浏览器打开 http://localhost:3000
```

## 关键文件
- `src/lib/prompts.ts` — 5 个 Prompt（主+速览+框架+术语+图表），本人设计
- `src/app/page.tsx` — 前端页面（上传+提问输入框+Tab切换+结果展示）
- `src/app/api/analyze/route.ts` — DeepSeek 分析路由（支持 main/overview/structure/terms）
- `src/app/api/upload/route.ts` — PDF 解析路由
- `src/app/api/chart/route.ts` — 图表多模态解读路由
- `.env.local` — DeepSeek API Key（已配置）

## Prompt 设计亮点
1. "文献未体现"标注——防止 AI 编造数据
2. "当前内容未经证实"——不确定内容不硬答
3. 主 Prompt 分析用户需求→推荐功能板块，体现产品交互
4. 每个子 Prompt 写"只输出本模块"——防止串台
5. "图片不清晰重新上传"——边界情况处理

## 当前状态
- [x] 项目脚手架
- [x] Prompt 定稿
- [x] API 路由
- [x] 前端页面
- [ ] 本地测试
- [ ] Vercel 部署
- [ ] 作品集（PRD+原型+复盘文档）

## 求职目标
7 个 AI PM 实习岗，优先级：深势科技 > 卡旺卡 > 积加 > 精准学 > 头条 > 字节风控 > 阿里
