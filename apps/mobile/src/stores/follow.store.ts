// Simple in-memory cache for follow state — survives navigation, resets on app restart
const followCache = new Map<string, boolean>();

export const followStore = {
  get: (sellerId: string): boolean | undefined => followCache.get(sellerId),
  set: (sellerId: string, following: boolean) => followCache.set(sellerId, following),
};