import { NextResponse } from 'next/server';

import {
  cancelAseanRefresh,
  getAseanRefreshConfig,
  readAseanRefreshStatus,
  startAseanRefresh,
} from '@/lib/world/asean-refresh-job';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    { ...(await readAseanRefreshStatus()), config: getAseanRefreshConfig() },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'start';
  if (action === 'cancel') {
    const canceled = await cancelAseanRefresh(url.searchParams.get('run_id') || undefined);
    return NextResponse.json(
      { canceled, status: await readAseanRefreshStatus() },
      { status: canceled ? 200 : 409, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
  const trigger = request.headers.get('x-world-refresh-run-id') ? 'world-refresh' : 'manual';
  const status = await startAseanRefresh(trigger);
  return NextResponse.json(status, {
    status: status.reused ? 200 : 202,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
