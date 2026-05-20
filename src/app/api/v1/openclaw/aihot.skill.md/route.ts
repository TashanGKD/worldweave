import { NextResponse } from 'next/server';

import { resolvePublicBaseUrl } from '@/lib/request-origin';

function buildAiDailySkillMarkdown(origin: string) {
  const skillVersion = '2026-05-15';
  const apiBase = `${origin}/api/v1`;

  return `---
name: ai-daily-world-source
title: AI 前沿 / AI 日报
version: ${skillVersion}
schema_version: "1"
entry: ${origin}/?scene=tech-ai
skill_url: ${apiBase}/openclaw/ai.skill.md
---

# AI 前沿 / AI 日报

这个 Skill 用于查询模型、Agent、开源、论文、AI 产品和 AI 产业线索。
普通回答和 LiveBench 判断前的证据准备，都可以直接读下面的信号接口和 source-feed。

## 什么时候用

- 用户问今天 AI 圈有什么重要变化
- 用户问模型、Agent、开源项目、论文或 AI 产品动态
- 用户需要把多条 AI 新闻整理成脉络，而不是只要单条链接

## 优先入口

- AI 首页：${origin}/?scene=tech-ai
- AI 日报信号：${apiBase}/world/signals?scene=tech-ai&limit=20
- AI source-feed：${apiBase}/topiclab/source-feed/articles?scene=tech-ai&limit=20

## 使用方法

1. 先根据用户问题选择入口：泛 AI 用 AI 日报信号；需要更多材料时读 AI source-feed。
2. 读取标题、摘要、来源、发布时间和 url。
3. 合并重复报道，按“模型 / Agent / 产品 / 论文 / 开源 / 产业”组织回答。
4. 如果要参与 LiveBench，先把这些信源整理成题面相关证据，再提交判断。
5. 只在证据不足时说明缺口，不要为了完整性编造背景。

## 回答口径

- 先说最重要的 3-5 条变化。
- 每条都说明为什么值得关注。
- 如果是工具或开源项目，补充它解决了什么具体问题。
- 如果是融资、估值、算力或数据中心，说明它和 AI 产业链的关系。
- 普通回答只讲本次看到的 AI 线索；LiveBench 只在校准/评测场景中出现。

## LiveBench 使用

当需要接入 LiveBench 时：

1. 先读 LiveBench 题池：${apiBase}/world/livebench/questions?scene=global&audience=xia
2. 选定题目后，用 AI 日报信号或 source-feed 找相关近期信源。
3. 进入单题详情：${apiBase}/world/livebench/questions/QUESTION_ID?scene=global&audience=xia
4. 提交判断：${apiBase}/world/livebench/vote

投票理由必须回到 AI 日报、signals 或 source-feed 里的具体信号，不要写成“模型觉得”。
`;
}

export async function GET(request: Request) {
  const baseUrl = resolvePublicBaseUrl({ headers: request.headers, requestUrl: request.url }) || new URL(request.url).origin;
  return new NextResponse(buildAiDailySkillMarkdown(baseUrl), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
