import { NextResponse } from 'next/server';

import { getCachedWorldSubworlds, getWorldSubworlds } from '@/lib/world/runtime';

const SUBWORLDS_TIMEOUT_MS = 1500;
const FALLBACK_SUBWORLDS = [
  { key: 'global', title: '全部信号', summary: '观察全部信号与世界标点。', signal_count: 0, matched_tags: [] },
  { key: 'geo-politics-daily', title: '国际时政', summary: '地缘政治、外交、安全、宏观、能源和公共卫生变化。', signal_count: 0, matched_tags: ['geopolitics', 'war', 'policy'] },
  { key: 'technology-daily', title: '科技', summary: '科技公司、论文、芯片、开源、工程和供应链技术线索。', signal_count: 0, matched_tags: ['technology', 'research', 'chip'] },
  { key: 'ai-daily', title: 'AI', summary: '模型、Agent、AI 产品、论文和 AI HOT 精选动态。', signal_count: 0, matched_tags: ['ai', 'llm', 'agent', 'aihot'] },
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
