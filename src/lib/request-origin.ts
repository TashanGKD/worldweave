type HeaderSource = Pick<Headers, 'get'> | null | undefined;

function readFirstConfiguredEnv(names: string[]) {
  for (const name of names) {
    const value = normalizeOrigin(process.env[name]);
    if (value) return value;
  }
  return null;
}

function readHeader(headers: HeaderSource, name: string) {
  const value = headers?.get(name);
  if (!value) return '';
  return value
    .split(',')[0]
    ?.trim()
    .replace(/\/+$/, '');
}

function normalizeOrigin(value: string | null | undefined) {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  return trimmed || null;
}

function inferProtocol(host: string) {
  const hostname = host.replace(/:\d+$/, '');
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    hostname.startsWith('169.254.')
  ) {
    return 'http';
  }

  return 'https';
}

export function resolveRequestOrigin(input?: {
  headers?: HeaderSource;
  requestUrl?: string | null;
  fallbackOrigin?: string | null;
}) {
  const host = readHeader(input?.headers, 'x-forwarded-host') || readHeader(input?.headers, 'host');
  const protocol =
    readHeader(input?.headers, 'x-forwarded-proto') ||
    readHeader(input?.headers, 'x-forwarded-protocol') ||
    (host ? inferProtocol(host) : '');

  if (host && protocol) {
    return `${protocol}://${host}`;
  }

  if (input?.requestUrl) {
    try {
      return normalizeOrigin(new URL(input.requestUrl).origin);
    } catch {
      return normalizeOrigin(input.fallbackOrigin);
    }
  }

  return normalizeOrigin(input?.fallbackOrigin);
}

export function buildOpenClawSkillUrl(origin: string | null | undefined) {
  const normalizedOrigin = normalizeOrigin(origin);
  return normalizedOrigin ? `${normalizedOrigin}/api/v1/openclaw/skill.md` : null;
}

export function resolveConfiguredPublicOrigin() {
  return readFirstConfiguredEnv([
    'WORLD_PUBLIC_APP_ORIGIN',
    'NEXT_PUBLIC_WORLD_PUBLIC_APP_ORIGIN',
    'OPENCLAW_BASE_URL',
  ]);
}

export function resolveConfiguredSkillUrl() {
  return readFirstConfiguredEnv([
    'WORLD_PUBLIC_SKILL_URL',
    'NEXT_PUBLIC_WORLD_PUBLIC_SKILL_URL',
    'AGENT_WORLD_SKILL_URL',
  ]);
}

export function resolvePublicSkillUrl(input?: {
  headers?: HeaderSource;
  requestUrl?: string | null;
  fallbackOrigin?: string | null;
}) {
  const explicitSkillUrl = resolveConfiguredSkillUrl();
  if (explicitSkillUrl) return explicitSkillUrl;

  const configuredOrigin = resolveConfiguredPublicOrigin();
  if (configuredOrigin) return buildOpenClawSkillUrl(configuredOrigin);

  const requestOrigin = resolveRequestOrigin(input);
  return buildOpenClawSkillUrl(requestOrigin);
}
