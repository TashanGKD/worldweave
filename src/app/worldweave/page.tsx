import { redirect } from 'next/navigation';

type PageProps = {
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

export default async function WorldWeaveCompatibilityPage({ searchParams }: PageProps) {
  const query = serializeSearchParams((await searchParams) || {});
  redirect(query ? `/?${query}` : '/');
}
