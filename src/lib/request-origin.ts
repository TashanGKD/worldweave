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

function normalizePathPrefix(value: string | null | undefined) {
  const trimmed = (value || '').split(',')[0]?.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
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

function publicProtocolForHost(protocol: string, host: string) {
  const normalized = protocol.replace(/:$/, '').toLowerCase();
  if (normalized === 'http' && inferProtocol(host) === 'https') return 'https';
  return normalized || inferProtocol(host);
}

function inferRequestPathPrefix(requestUrl: string | null | undefined) {
  if (!requestUrl) return '';
  try {
    const pathname = new URL(requestUrl).pathname;
    const apiIndex = pathname.indexOf('/api/v1/');
    if (apiIndex > 0) return normalizePathPrefix(pathname.slice(0, apiIndex));
  } catch {
    return '';
  }
  return '';
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
    return `${publicProtocolForHost(protocol, host)}://${host}`;
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

export function resolveRequestBaseUrl(input?: {
  headers?: HeaderSource;
  requestUrl?: string | null;
  fallbackOrigin?: string | null;
}) {
  const origin = resolveRequestOrigin(input);
  if (!origin) return null;
  const forwardedPrefix =
    normalizePathPrefix(readHeader(input?.headers, 'x-forwarded-prefix')) ||
    normalizePathPrefix(readHeader(input?.headers, 'x-script-name'));
  const requestPrefix = inferRequestPathPrefix(input?.requestUrl);
  return normalizeOrigin(`${origin}${forwardedPrefix || requestPrefix}`);
}

export function buildOpenClawSkillUrl(baseUrl: string | null | undefined) {
  const normalizedBaseUrl = normalizeOrigin(baseUrl);
  return normalizedBaseUrl ? `${normalizedBaseUrl}/api/v1/openclaw/skill.md` : null;
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

function hasPathPrefix(value: string | null | undefined) {
  if (!value) return false;
  try {
    const pathname = new URL(value).pathname.replace(/\/+$/, '');
    return pathname !== '';
  } catch {
    return false;
  }
}

export function resolvePublicSkillUrl(input?: {
  headers?: HeaderSource;
  requestUrl?: string | null;
  fallbackOrigin?: string | null;
}) {
  const requestOrigin = resolveRequestOrigin(input);
  const requestBaseUrl = resolveRequestBaseUrl(input);
  const configuredOrigin = withRequestPortWhenLocal(resolveConfiguredPublicOrigin(), requestOrigin);
  if (requestOrigin) {
    try {
      if (isLocalHostname(new URL(requestOrigin).hostname)) {
        return buildOpenClawSkillUrl(requestBaseUrl || requestOrigin);
      }
    } catch {
      // Fall through to the configured public origin.
    }
  }
  if (configuredOrigin && hasPathPrefix(configuredOrigin)) return buildOpenClawSkillUrl(configuredOrigin);
  if (requestBaseUrl) return buildOpenClawSkillUrl(requestBaseUrl);
  if (configuredOrigin) return buildOpenClawSkillUrl(configuredOrigin);

  return buildOpenClawSkillUrl(requestBaseUrl || requestOrigin);
}

export function resolvePublicBaseUrl(input?: {
  headers?: HeaderSource;
  requestUrl?: string | null;
  fallbackOrigin?: string | null;
}) {
  const requestOrigin = resolveRequestOrigin(input);
  const requestBaseUrl = resolveRequestBaseUrl(input);
  const configuredOrigin = withRequestPortWhenLocal(resolveConfiguredPublicOrigin(), requestOrigin);
  if (requestOrigin) {
    try {
      if (isLocalHostname(new URL(requestOrigin).hostname)) {
        return requestBaseUrl || requestOrigin;
      }
    } catch {
      // Fall through to the configured public origin.
    }
  }
  if (configuredOrigin && hasPathPrefix(configuredOrigin)) return configuredOrigin;
  if (requestBaseUrl) return requestBaseUrl;
  return configuredOrigin || requestBaseUrl || requestOrigin || normalizeOrigin(input?.fallbackOrigin);
}
