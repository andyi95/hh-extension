export type HhPage =
  | { kind: 'vacancy'; hhId: string }
  | { kind: 'employer'; hhId: string }
  | { kind: 'negotiations' }
  | { kind: 'search' }
  | { kind: 'other-hh' }
  | { kind: 'not-hh' };

export const HH_ORIGINS = ['https://hh.ru/*', 'https://*.hh.ru/*'];

export function isHhHost(hostname: string): boolean {
  return hostname === 'hh.ru' || hostname.endsWith('.hh.ru');
}

export function parseHhUrl(url: string | undefined | null): HhPage {
  if (!url) return { kind: 'not-hh' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'not-hh' };
  }
  if (parsed.protocol !== 'https:' || !isHhHost(parsed.hostname)) return { kind: 'not-hh' };

  const path = parsed.pathname;
  let match = path.match(/^\/vacancy\/(\d+)/);
  if (match) return { kind: 'vacancy', hhId: match[1] };
  match = path.match(/^\/employer\/(\d+)/);
  if (match) return { kind: 'employer', hhId: match[1] };
  if (path.startsWith('/applicant/negotiations')) return { kind: 'negotiations' };
  if (path.startsWith('/search/vacancy')) return { kind: 'search' };
  return { kind: 'other-hh' };
}

export function vacancyUrl(hhId: string): string {
  return `https://hh.ru/vacancy/${hhId}`;
}

export function employerUrl(hhId: string): string {
  return `https://hh.ru/employer/${hhId}`;
}

/** Достаёт числовой ID из href вида /vacancy/123 или /employer/456. */
export function idFromHref(href: string | null | undefined, kind: 'vacancy' | 'employer'): string | null {
  if (!href) return null;
  return href.match(new RegExp(`/${kind}/(\\d+)`))?.[1] ?? null;
}
