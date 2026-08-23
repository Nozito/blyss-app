interface PaginatedResponse<T> {
  data?: T[];
  meta?: { total?: number };
}

/**
 * Charge toutes les pages d'un endpoint admin paginé (page/limit/meta.total),
 * en parallèle après la première page — pas page par page en séquence.
 * Avec N pages, ça coûte ~2 allers-retours réseau au lieu de N.
 */
export async function fetchAllPages<T>(baseUrl: string, limit = 200): Promise<T[]> {
  const firstResponse = await fetch(`${baseUrl}?page=1&limit=${limit}`, { credentials: "include" });
  if (!firstResponse.ok) return [];

  const firstData: PaginatedResponse<T> = await firstResponse.json();
  const firstItems = firstData.data ?? [];
  const total = firstData.meta?.total ?? firstItems.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (totalPages <= 1) return firstItems;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetch(`${baseUrl}?page=${i + 2}&limit=${limit}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((d: PaginatedResponse<T>) => d.data ?? [])
        .catch(() => [] as T[])
    )
  );

  return firstItems.concat(...remainingPages);
}
