type HeaderSource = Pick<Headers, 'get'> | null | undefined;

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

function isLocalHostname(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function inferProtocol(host: string) {
  const hostname = host.replace(/:\d+$/, '');
  if (
    isLocalHostname(hostname) ||
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
  return normalizeOrigin(process.env.OPENCLAW_BASE_URL);
}

function withRequestPortWhenLocal(configuredOrigin: string | null, requestOrigin: string | null) {
  if (!configuredOrigin || !requestOrigin) return configuredOrigin;
  try {
    const configured = new URL(configuredOrigin);
    const request = new URL(requestOrigin);
    if (configured.port || !request.port || configured.protocol !== request.protocol) return configuredOrigin;
    if (!isLocalHostname(request.hostname)) return configuredOrigin;
    configured.port = request.port;
    return normalizeOrigin(configured.toString());
  } catch {
    return configuredOrigin;
  }
}

export function resolvePublicSkillUrl(input?: {
  headers?: HeaderSource;
  requestUrl?: string | null;
  fallbackOrigin?: string | null;
}) {
  const requestOrigin = resolveRequestOrigin(input);
  const configuredOrigin = withRequestPortWhenLocal(resolveConfiguredPublicOrigin(), requestOrigin);
  if (configuredOrigin) return buildOpenClawSkillUrl(configuredOrigin);

  return buildOpenClawSkillUrl(requestOrigin);
}
