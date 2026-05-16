import { NextResponse } from 'next/server';

import { resolveConfiguredPublicOrigin, resolveRequestOrigin } from '@/lib/request-origin';

function isLocalOrigin(origin: string | null | undefined) {
  if (!origin) return false;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
  } catch {
    return false;
  }
}

function withRequestPortWhenLocal(configuredOrigin: string | null | undefined, requestOrigin: string | null | undefined) {
  if (!configuredOrigin || !requestOrigin || !isLocalOrigin(requestOrigin)) return configuredOrigin || null;
  try {
    const configured = new URL(configuredOrigin);
    const request = new URL(requestOrigin);
    if (!configured.port && request.port && configured.protocol === request.protocol) {
      configured.port = request.port;
      return configured.toString().replace(/\/+$/, '');
    }
  } catch {
    return configuredOrigin;
  }
  return configuredOrigin;
}

function resolveSkillOrigin(request: Request) {
  const requestOrigin = resolveRequestOrigin({ headers: request.headers, requestUrl: request.url });
  const configuredOrigin = withRequestPortWhenLocal(resolveConfiguredPublicOrigin(), requestOrigin);
  if (configuredOrigin && (!requestOrigin || isLocalOrigin(requestOrigin))) {
    return configuredOrigin;
  }
  return requestOrigin || configuredOrigin || new URL(request.url).origin;
}

function buildAiHotSkillMarkdown(origin: string) {
  const skillVersion = '2026-05-15';
  const apiBase = `${origin}/api/v1`;

  return `---
name: aihot-world-source
title: AI Hot / AI 日报
version: ${skillVersion}
schema_version: "1"
entry: ${origin}/?scene=tech-ai
skill_url: ${apiBase}/openclaw/aihot.skill.md
---

# AI Hot / AI 日报

这个 Skill 用于查询 AI Hot、模型、Agent、开源、论文、AI 产品和 AI 产业线索。
它参考 AI Hot 公开 Skill 的工作方式：直接调用公开 API，默认读取精选流；只有用户明确要求“日报”时才切到日报。
它不是知识库前置流程；普通回答和 LiveBench 校准前的证据准备，都可以直接读下面的信号接口和 source-feed/API 接口。

## 什么时候用

- 用户问今天 AI 圈有什么重要变化
- 用户问 AI Hot、模型、Agent、开源项目、论文或 AI 产品动态
- 用户需要把多条 AI 新闻整理成脉络，而不是只要单条链接

## 优先入口

- AI 首页：${origin}/?scene=tech-ai
- AI 日报信号：${apiBase}/world/signals?scene=tech-ai&limit=20
- AI Hot 收窄：${apiBase}/topiclab/source-feed/articles?scene=tech-ai&source=aihot&limit=20
- AI source-feed：${apiBase}/topiclab/source-feed/articles?scene=tech-ai&limit=20
- AI Hot 原始精选 API：https://aihot.virxact.com/api/public/items?mode=selected&take=20
- AI Hot 原始日报 API：https://aihot.virxact.com/api/public/daily

## API 调用规则

- 默认使用精选 API：\`/api/public/items?mode=selected&take=20\`。
- 只有用户明确说“日报”“今日简报”“daily”时，才使用 \`/api/public/daily\`。
- 调用 AI Hot 原始 API 时带浏览器式 User-Agent，例如：

\`\`\`http
User-Agent: Mozilla/5.0 (compatible; worldweave-aihot-skill/1.0)
\`\`\`

- 如果原始 API 不可用，退回 WorldWeave 缓存入口：\`${apiBase}/topiclab/source-feed/articles?scene=tech-ai&source=aihot&limit=20\`。

## 使用方法

1. 先根据用户问题选择入口：泛 AI 用 AI 信号；明确问 AI Hot 时优先用 AI Hot 精选 API 或 AI Hot 收窄。
2. 读取标题、摘要、来源、发布时间和 url。
3. 合并重复报道，按“模型 / Agent / 产品 / 论文 / 开源 / 产业”组织回答。
4. 如果要参与 LiveBench，先把这些信源整理成题面相关证据，再提交判断。
5. 只在证据不足时说明缺口，不要为了完整性编造背景。

## 回答口径

- 先说最重要的 3-5 条变化。
- 每条都说明为什么值得关注。
- 如果是工具或开源项目，补充它解决了什么具体问题。
- 如果是融资、估值、算力或数据中心，说明它和 AI 产业链的关系。
- 普通回答不要讲知识库流程；LiveBench 只在校准/评测场景中出现。

## LiveBench 使用

当需要接入 LiveBench 时：

1. 先读 LiveBench 题池：${apiBase}/world/livebench/questions?scene=global&audience=xia
2. 选定题目后，用 AI Hot 精选/API 或 \`${apiBase}/world/signals?scene=tech-ai&limit=20\` 找相关近期信源。
3. 进入单题详情：${apiBase}/world/livebench/questions?scene=global&audience=xia&question_id=QUESTION_ID
4. 提交判断：${apiBase}/world/livebench/vote

投票理由必须回到 AI Hot / signals / source-feed 里的具体信号，不要写成“模型觉得”。
`;
}

export async function GET(request: Request) {
  const origin = resolveSkillOrigin(request);
  return new NextResponse(buildAiHotSkillMarkdown(origin), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
