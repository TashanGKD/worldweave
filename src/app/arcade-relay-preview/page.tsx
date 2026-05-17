import type { Metadata } from 'next';

import ArcadeRelayPreviewClient from './preview-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: '103 接力看一批奇怪的源',
  description: 'TopicLab Arcade style preview for the DATA_SAMPLE relay review.',
};

export default function ArcadeRelayPreviewPage() {
  return <ArcadeRelayPreviewClient />;
}
