import { NextResponse } from 'next/server';

import { resolvePublicBaseUrl } from '@/lib/request-origin';

function mainSkillUrl(origin: string) {
  const apiBase = `${origin}/api/v1`;
  return `${apiBase}/openclaw/skill.md`;
}

export async function GET(request: Request) {
  const baseUrl = resolvePublicBaseUrl({ headers: request.headers, requestUrl: request.url }) || new URL(request.url).origin;
  return NextResponse.redirect(mainSkillUrl(baseUrl), {
    status: 307,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
