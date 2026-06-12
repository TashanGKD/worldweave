import { redirect } from 'next/navigation';

type PageProps = {
  params?: Promise<{ path?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function serializeSearchParams(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else if (typeof value === 'string') {
      search.set(key, value);
    }
  }
  return search.toString();
}

export default async function WorldWeaveMountedPathCompatibilityPage({ params, searchParams }: PageProps) {
  const path = (await params)?.path || [];
  const pathname = `/${path.map((item) => encodeURIComponent(item)).join('/')}`;
  const query = serializeSearchParams((await searchParams) || {});
  redirect(query ? `${pathname}?${query}` : pathname);
}
