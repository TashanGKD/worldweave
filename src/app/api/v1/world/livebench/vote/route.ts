import { NextResponse } from 'next/server';

import { deleteWorldApiSnapshots } from '@/lib/world/api-snapshot';
import { submitLiveBenchVoteFast } from '@/lib/world/livebench';
import type { LiveQuestionSide } from '@/lib/world/types';

type VoteBody = {
  question_id?: string;
  xia_id?: string;
  source?: 'xia' | 'external';
  contributor_kind?: 'xia' | 'human' | 'ai' | 'community' | null;
  contributor_label?: string | null;
  origin_url?: string | null;
  side?: LiveQuestionSide;
  probability_yes?: number;
  human_readable_prediction?: string;
  human_readable_why?: string;
  cited_signal_ids?: string[];
  cited_vote_ids?: string[];
  what_changes_my_mind?: string;
  created_at?: string;
  historical_backfill?: boolean;
  source_attached?: boolean;
  source_snapshot_id?: string | null;
  source_context_generated_at?: string | null;
  source_cutoff_at?: string | null;
  source_signal_count?: number | null;
  source_embedding_backend?: string | null;
  source_latest_signal_published_at?: string | null;
  source_governance_finished_at?: string | null;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = (await request.json()) as VoteBody;
    if (!body.question_id || !body.xia_id || !body.side) {
      return NextResponse.json({ error: 'question_id, xia_id, side are required' }, { status: 400 });
    }

    const vote = await submitLiveBenchVoteFast({
      question_id: body.question_id,
      xia_id: body.xia_id,
      source: body.source,
      contributor_kind: body.contributor_kind,
      contributor_label: body.contributor_label,
      origin_url: body.origin_url,
      side: body.side,
      probability_yes: typeof body.probability_yes === 'number' ? body.probability_yes : undefined,
      human_readable_prediction: body.human_readable_prediction || '',
      human_readable_why: body.human_readable_why || '',
      cited_signal_ids: body.cited_signal_ids,
      cited_vote_ids: body.cited_vote_ids,
      what_changes_my_mind: body.what_changes_my_mind,
      created_at: body.created_at,
      historical_backfill: body.historical_backfill,
      source_attached: body.source_attached,
      source_snapshot_id: body.source_snapshot_id,
      source_context_generated_at: body.source_context_generated_at,
      source_cutoff_at: body.source_cutoff_at,
      source_signal_count: body.source_signal_count,
      source_embedding_backend: body.source_embedding_backend,
      source_latest_signal_published_at: body.source_latest_signal_published_at,
      source_governance_finished_at: body.source_governance_finished_at,
    });
    await deleteWorldApiSnapshots('global', ['livebench_questions', 'livebench_evaluation']);
    return NextResponse.json(vote, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'x-world-vote-elapsed-ms': String(Date.now() - startedAt),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit livebench vote';
    const isValidationError =
      error instanceof Error &&
      /(question_id, xia_id, side are required|Live question not found|still in cooldown|must include|must align|too generic|conflicts with side\/probability_yes)/i.test(
        error.message,
      );
    return NextResponse.json(
      { error: message },
      { status: isValidationError ? 400 : 500 },
    );
  }
}
