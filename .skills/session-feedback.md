# Auxtion Session Feedback — For Claude to Load at Start of Every Session

This file captures corrections, stated preferences, patterns I got wrong, and things to do differently.
Load this at the start of every session alongside `auxtion-architecture.md`.

---

## Communication & Workflow Preferences

- **Ask clarifying questions BEFORE writing any code** when the feature has ambiguous UX decisions (e.g. "can seller pull back?", "one at a time or multiple?"). Jimwell prefers to answer these upfront rather than having me build the wrong thing and correct it after.
- **Don't over-explain.** Jimwell said "be concise and practical, never generic." Keep explanations tight. He's an experienced developer — no beginner scaffolding.
- **When giving file locations, always include full path from project root.** Never say "in your live.tsx" — say `apps/mobile/app/auction/[id]/live.tsx`.
- **When feature scope becomes clear mid-conversation, summarize the full picture before coding.** E.g. "Here's the full picture before I code:" — this helped Jimwell validate direction before implementation started.
- **Step numbering on multi-file changes is helpful.** He reviews changes file by file. Using Step 1 / Step 2 / Step N with clear file headers made it easy to follow.
- **Always end with a single git commit command** that covers all changes for the session task. Jimwell runs this directly.

---

## TypeScript Mistakes to Avoid

### 1. Union type narrowing on state setters
**Problem I made:** When `soldItemWinners` had `mode: 'auction' | 'chat'` but `currentItemRef.current?.mode` could be `'buynow'`, TypeScript rejected the setter because the return type widened.

**Fix:** Always extend the state type when adding new mode variants. `mode: 'auction' | 'chat'` should have been `mode: 'auction' | 'chat' | 'buynow'` from the start once `CurrentItem.mode` was extended.

**Rule:** When extending a union type on `CurrentItem`, immediately audit every other state that stores or derives from `mode` and extend those too.

### 2. `as const` with spread on mixed arrays
**Problem I made:** Used `as const` on an array spread with conditional elements, which TypeScript rejects.

**Fix:** Cast to an explicit union type instead:
```typescript
// Wrong
[...(['bidding', 'buynow', 'sold'] as const), ...(isSeller ? ['offers'] : [])]

// Right  
(['bidding', 'buynow', 'sold', ...(isSeller ? ['offers'] : [])] as ('bidding' | 'buynow' | 'sold' | 'offers')[])
```

### 3. Stale closure in socket callbacks
**Problem I made:** Tried to reference `showShop` state directly inside a `useCallback` socket handler — it would always be the initial value.

**Fix:** Always use a ref for values that need to be read inside socket callbacks:
```typescript
const showShopRef = useRef(false);
useEffect(() => { showShopRef.current = showShop; }, [showShop]);
// Then use showShopRef.current inside callbacks
```

### 4. `itemMode` state does not need `'buynow'`
`itemMode` is the seller's modal selection (Swipe vs Chat Bid). It's `'auction' | 'chat'` only. `'buynow'` is set on `CurrentItem.mode` via socket events, not through this state. These are separate concerns — don't conflate them.

---

## Architecture Patterns Jimwell Prefers

### Socket events — always follow this sequence:
1. Add interface in `bidding.gateway.ts`
2. Add `@SubscribeMessage` handler
3. Add off/on listeners in `useSocket.ts` `setupSocket()`
4. Add emitter function in `useSocket.ts`
5. Add to return object of `useAuctionSocket`
6. Destructure in `live.tsx` hook call
7. Pass callback in `useAuctionSocket({...})` options object

**I missed step 6/7 in one session** — the callbacks were defined but not destructured from the hook or passed as options. Always verify the full chain.

### Prisma enum additions — always run migration before frontend
When adding a new enum value (e.g. `LIVE_BUYNOW` to `ShopItemStatus`), the migration must be run with the public Railway URL before any frontend code that references the new status:
```bash
cd apps/api
DATABASE_URL="postgresql://postgres:PASSWORD@maglev.proxy.rlwy.net:47483/railway" \
  npx prisma migrate dev --name <name>
npx prisma generate
```

### Buy Now mode separation
- `SHOP_ONLY` → item sits in Buy Now tab passively
- `LIVE_SWIPE` → seller actively presents it, viewers swipe to buy (uses `LIVE_BUYNOW` status in DB)
- These are decided at **Add Item** time, not after
- The sub-option picker appears inside the Add Item modal when `newAddMode === 'buynow'`
- "Show Live" is disabled (`opacity: 0.35`) if `currentItem` exists — one active item at a time

---

## UX Decisions Made This Session (Don't Re-ask)

| Decision | Answer |
|---|---|
| Can seller pull Live Buy Now back without anyone buying? | Yes — same as chat bid skip, returns item to AVAILABLE status in Buy Now tab |
| Multiple Live Swipe items simultaneously? | No — one at a time, same rule as auctions |
| Where does the Shop/Live sub-option appear? | In Add Item modal when Buy Now mode is selected, not after listing |
| Does "Show Live" disable when something is running? | Yes — `opacity: 0.35`, tapping shows Alert |
| Does offer notification auto-switch shop tab? | Yes — if shop is open, auto-switches to Offers tab using `showShopRef` |
| Does seller see an Alert when accepting an offer? | No — inject a `system_offer` chat message instead, no blocking Alert |
| Is the decline silent when using "Run at offer price"? | Yes — `?silent=true` query param skips the socket emit to buyer |
| Does offer chat message show to all room participants? | Yes — `onOfferReceived` injects before the seller guard |

---

## UI / Design Rules Jimwell Enforces

- **Always use `useSafeAreaInsets`** — never hardcode `paddingTop: 56` or `paddingBottom: 40`
- **Dynamic layout values** — `BOTTOM_BAR_HEIGHT`, `CONTROLS_BOTTOM`, `ITEM_BAR_BOTTOM` must all derive from each other, not be magic numbers
- **Glassmorphism style:** `rgba(255,255,255,0.15)` bg + `rgba(255,255,255,0.25)` border for controls
- **SwipeBidButton** should accept a `color` prop so it can be reused for Buy Now (green `#10B981`) vs Bid (blue `#1A56DB`)
- Test target: iPhone 16 Plus, iOS 18.2
- **No black flash on modal overlays** — use `StyleSheet.absoluteFillObject` or opaque background on modals

---

## Feature Patterns That Work Well

### "Run at offer price" flow (implemented, working)
1. Seller taps "Run at ₱X" in offers tab
2. `PATCH /offers/:id/decline?silent=true` — silent so buyer doesn't get notified
3. `PATCH /shop-items/:id/convert-to-auction` with `{ startingPrice: offer.amount }`
4. Close shop, open Start Item modal pre-loaded with converted item

### Live Buy Now flow (implemented, working)
1. Seller adds item → Buy Now → Show Live (disabled if currentItem)
2. API creates item as `BUY_NOW` type, status `AVAILABLE`
3. `startLiveBuyNow` socket event → backend sets `LIVE_BUYNOW` status
4. `live-buynow-started` emitted to room → all clients see item bar + swipe button
5. Buyer swipes → `claim-buynow` → backend sets `SOLD` atomically → `buynow-claimed` to room
6. Seller can `pull-buynow` → item returns to `AVAILABLE` in Buy Now tab

### Sold tab mode tracking
`soldItemWinners` record stores `mode: 'auction' | 'chat' | 'buynow'` per item.
This is set in three places:
- `onItemEnded` → reads `currentItemRef.current?.mode`
- `onBuyNowClaimed` → hardcoded `'buynow'`
- `getById` seeding → reads `item.mode` from DB

---

## Things I Should Always Do

- **Before implementing a feature: Overview → Architecture → Implementation → Code** (Jimwell's preferred format)
- **After all file changes: one clean git command** that adds, commits, pushes to develop, merges to main, pushes main, returns to develop
- **When a feature spans multiple files: list every file and every exact location** (file path + function name + what to find + what to replace)
- **Never give partial implementations.** If a change requires touching 8 places across 3 files, give all 8.
- **Never leave TypeScript errors unfixed** before saying the implementation is complete
- **When adding a new socket callback to `useAuctionSocket`:** verify it's in the interface, destructured from the options param, registered in `setupSocket`, and returned from the hook

---

## Things I Should Never Do

- **Never hardcode device-specific padding values** — always derive from `useSafeAreaInsets`
- **Never use `as const` on arrays with conditional spreads** — cast to explicit union type instead
- **Never assume a type is wide enough** — when in doubt, check every state that touches a union before extending it
- **Never leave stale closures in socket callbacks** — use refs for values that change over time
- **Never build before clarifying UX ambiguity** — ask first, especially for: "who can do this?", "when is it disabled?", "what happens if X?"
- **Never give the commit command before listing all the changes** — Jimwell reads the changes first, then commits