import { NextResponse } from 'next/server';

import { getWorldSourceGovernance } from '@/lib/world/runtime';

export async function GET() {
  try {
    return NextResponse.json(await getWorldSourceGovernance(), {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load source governance state' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  }
}
