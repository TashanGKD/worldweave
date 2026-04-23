import { NextResponse } from 'next/server';

import { getCachedWorldSubworlds, getWorldSubworlds } from '@/lib/world/runtime';

const SUBWORLDS_TIMEOUT_MS = 1500;
const FALLBACK_SUBWORLDS = [
  { key: 'global', title: '主世界', summary: '观察全部信号与世界标点。', signal_count: 0, matched_tags: [] },
  { key: 'war', title: '冲突', summary: '冲突、外交、军事与制裁链条。', signal_count: 0, matched_tags: ['war'] },
  { key: 'technology', title: '科技', summary: '模型、论文、芯片与实验室。', signal_count: 0, matched_tags: ['technology'] },
  { key: 'capacity', title: '产能与供应链', summary: '能源、航运、制造与物流联动。', signal_count: 0, matched_tags: ['capacity'] },
  { key: 'finance', title: '市场', summary: '市场、监管、财报、宏观与政策定价。', signal_count: 0, matched_tags: ['finance'] },
  { key: 'health', title: '公共卫生', summary: '疫情、疾病、临床与生物安全。', signal_count: 0, matched_tags: ['health'] },
  { key: 'weak-signal', title: '弱信号', summary: '社媒、论坛、预测市场与早期回响。', signal_count: 0, matched_tags: ['social'] },
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
