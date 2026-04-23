import { NextResponse } from 'next/server';

import { getWorldMarketSnapshot } from '@/lib/world/runtime';

export async function GET() {
  try {
    return NextResponse.json(await getWorldMarketSnapshot());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load market snapshot' },
      { status: 500 },
    );
  }
}
