import { NextResponse } from 'next/server';

import { getCachedWorldSubworlds, getWorldSubworlds } from '@/lib/world/runtime';

const SUBWORLDS_TIMEOUT_MS = 1500;
const FALLBACK_SUBWORLDS = [
  { key: 'geo-politics-daily', title: '地缘', summary: '冲突、外交、制裁、选举、公共安全和区域风险。', signal_count: 0, matched_tags: ['geopolitics', 'war', 'conflict', 'diplomacy'] },
  { key: 'tech-ai', title: 'AI', summary: '模型、Agent、AI 产品、论文、开源和 AI 前沿动态。', signal_count: 0, matched_tags: ['technology', 'ai', 'llm', 'agent', 'chip', 'aihot', 'ai-news-radar'] },
  { key: 'asean', title: '东盟', summary: '东盟、东南亚供应链、南海、区域安全、市场和公共卫生。', signal_count: 0, matched_tags: ['asean', 'southeast-asia', 'south-china-sea', 'rcep'] },
] as const;

export async function GET() {
  const cachedSubworlds = await getCachedWorldSubworlds();
  const subworlds = await Promise.race([
    getWorldSubworlds(),
    new Promise<typeof FALLBACK_SUBWORLDS | Awaited<ReturnType<typeof getCachedWorldSubworlds>>>((resolve) =>
      setTimeout(() => resolve(cachedSubworlds.length > 0 ? cachedSubworlds : FALLBACK_SUBWORLDS), SUBWORLDS_TIMEOUT_MS),
    ),
  ]);
  return NextResponse.json({ subworlds });
}
