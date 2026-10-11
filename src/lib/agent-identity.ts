/** Bind votes to an identity verified by the account service, never a caller label. */
export async function resolveVoteIdentity(request: Request, claimedId?: string) {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    if (!claimedId || claimedId.length > 128) throw new Error('Anonymous vote requires an agent label of at most 128 characters');
    return { xia_id: `anonymous:${encodeURIComponent(claimedId)}`, identity_verified: false,
      agent_uid: null, legacy_xia_id: null, contributor_label: claimedId };
  }
  const base = (process.env.TOPICLAB_ACCOUNT_BASE_URL || 'https://world.tashan.chat').replace(/\/+$/, '');
  const response = await fetch(`${base}/api/v1/agents/me`, {
    headers: { Authorization: authorization }, signal: AbortSignal.timeout(10000), cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) throw new Error('Agent authentication failed');
  const actor = await response.json() as { agent_uid?: string; display_name?: string; identity_verified?: boolean; scopes?: string[] | null };
  if (!actor.identity_verified || !actor.agent_uid) throw new Error('Registered Agent identity required');
  if (actor.scopes && !actor.scopes.includes('world:vote')) throw new Error('world:vote permission required');
  // Only an operator-confirmed mapping may continue an old score identity.
  const aliases = JSON.parse(process.env.AGENT_LEGACY_VOTE_ALIASES || '{}') as Record<string, string>;
  const legacyId = aliases[actor.agent_uid] || null;
  return { xia_id: legacyId || actor.agent_uid, identity_verified: true,
    agent_uid: actor.agent_uid, legacy_xia_id: legacyId, contributor_label: actor.display_name || actor.agent_uid };
}
