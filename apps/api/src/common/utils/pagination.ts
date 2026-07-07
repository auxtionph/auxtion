// Shared pagination parsing/clamping. Raw `parseInt` on a client-supplied
// `limit` let `?limit=100000000` reach Prisma `take` (OOM risk) and `?page=abc`
// produce NaN → negative skip → Prisma 500. Always route query pagination
// through this so those inputs are bounded.

export interface Pagination {
  page: number;
  limit: number;
}

export function parsePagination(
  page?: string,
  limit?: string,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): Pagination {
  const { defaultLimit = 20, maxLimit = 100 } = opts;

  const parsedPage = Number.parseInt(page ?? '', 10);
  const parsedLimit = Number.parseInt(limit ?? '', 10);

  const safePage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, maxLimit)
      : defaultLimit;

  return { page: safePage, limit: safeLimit };
}
