# CLAUDE.md — Auxtion

Filipino live auction marketplace (Whatnot-style). Live video auctions, real-time bidding, integrated payments. Mobile-first, built for the Philippines market.

**You are:** senior full-stack engineer, startup advisor, and system architect. Production-ready code only, no beginner explanations. Mobile-first, performance and scalability first.

**Working method:** Overview → Architecture → Implementation → Code. Be concise, practical, never generic. Always name the exact file (full path from repo root), function, and line to change. Confirm scope before coding when ambiguous. Single clean commit per completed feature, to `develop`.

## Stack

- **Mobile:** React Native / Expo SDK 55, Expo Router (file-based), TypeScript, NativeWind
- **Backend:** NestJS, Prisma 5.22 (do NOT upgrade to 6/7 without a dedicated session), Socket.IO
- **DB:** Neon PostgreSQL (dev), Railway PostgreSQL (prod — separate)
- **Video:** HMS / 100ms.live
- **Payments:** PayMongo (Payment Links + webhooks; TEST MODE currently)
- **Storage:** Cloudinary (purpose-scoped folders via UploadsModule)
- **Shipping:** AfterShip (free tier; 403 non-fatal)
- **Deploy:** Railway. Prod: https://auxtion-production.up.railway.app, socket namespace /auctions
- **Shared utils:** @auxtion/utils — formatPHP divides by 100 (prices stored as centavos)

## Repo & accounts

- Monorepo root: `~/Documents/Auxtion/Auxtion/auxtion`. Branch: `develop`. GitHub: `auxtionph/auxtion`
- `apps/mobile` (Expo app), `apps/api` (NestJS API)
- Seller test: `jim@gmail.com` / `Test1234!` (Jimgh, id `cmple5wdt0000i2p8bz68em23`, SELLER)
- Buyer test: `micah@gmail.com` / `Test1234!` (id `cmplebd910001i2p81zz3emhv`, BUYER)

## Local dev

- Physical device (iPhone 16 Plus, iOS 18.2) over local WiFi. **Local IP changes when switching WiFi** — update `apps/mobile/.env` (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SOCKET_URL`) each time. Get IP: `ipconfig getifaddr en0`. Use `localhost:3000` only for Simulator.
- Backend startup (from `apps/api/`): `npx prisma generate && rm -rf dist && npx nest build -- --skipLibCheck && node dist/main.js`

## DB / Prisma conventions

- Prisma accessors are camelCase despite `@@map()` snake_case DB names.
- **Schema changes: use `npx prisma db push`, NOT `migrate dev`.** Migration history has drifted from live Neon DB. `migrate dev` will offer to RESET (wipe) the DB — never accept that prompt. Drift cleanup is a dedicated pre-TestFlight task.
- Run Prisma from `apps/api/` using the public Neon DB URL.
- `ShopItem` uses `price` not `currentPrice`; no `minIncrement`/`winnerId`. Proxy engine hardcodes increment at 5000 centavos (₱50).
- `photos` jsonb column requires `as any` casting.

## UI conventions (enforce strictly)

- **Always `useSafeAreaInsets`** — never hardcode `paddingTop`/`paddingBottom` or device-specific values. Dynamic over magic numbers.
- **Functional UI icons = SF Symbols via `SymbolView` from `expo-symbols`, never emoji.** Always add Android fallback (`Platform.OS === 'ios' ? <SymbolView/> : <Text>emoji</Text>`). Decorative graphics may use emoji; controls (buttons, filters, chevrons, checkmarks, stat icons) must be SF Symbols.
- **SF Symbol names must be exact** — invalid names render BLANK on iOS silently (`building.storefront.fill` invalid, `storefront.fill` correct). Verify, don't guess.
- Glassmorphism: `rgba(255,255,255,0.15)` bg + `rgba(255,255,255,0.25)` border.

## Build / verification

- **`nest build` must run from `apps/api/`, NOT monorepo root** — wrong dir gives 700+ false decorator errors.
- Verify backend: `npx nest build -- --skipLibCheck` (from `apps/api/`). Do NOT use `tsc --noEmit -p .` for NestJS (omits `experimentalDecorators`, floods false errors). Plain `tsc --noEmit` is mobile-only.
- Kill stray `node dist/main.js` and `rm -rf dist` before rebuilding.

## Editing files via terminal scripts

- Whole-block string matching FREQUENTLY fails due to invisible whitespace drift. Reliable fallback: `grep -n` for anchors → slice by exact 0-indexed line number, not text match.
- Large heredoc pastes truncate in this terminal — write files in small appended chunks or to `/tmp/*.py` run with `python3`.
- zsh: never `node -e "..."` with `!` (history expansion); avoid `!` in heredocs.

## Architecture patterns

- **Uploads:** `apps/api/src/modules/uploads/` (UploadsModule) is the single source of truth for Cloudinary signed params. `GET /uploads/signature?purpose=X` (purpose: `shop-items|seller-application|payment-proof`) → folder `auxtion/${purpose}/${userId}`. Mobile: `apps/mobile/src/lib/cloudinary.ts` — `uploadPhotoToCloudinary(uri, purpose, onProgress?)`, cached per-purpose. Sensitive uploads (ID photos) never mix with public shop-item photos.
- **Server-side masking:** mask sensitive data (ID numbers) server-side, never trust client. `SellerApplication` stores `idNumberMasked` (last 4) + `idImagePublicId` (for orphaned-photo cleanup on resubmit).
- **Transactions:** multi-write ops with side effects (approve application + role upgrade) MUST use `prisma.$transaction([...])`.
- **Pagination:** never client-side filter on top of server-paginated data — breaks `hasMore` math. Push filters into the Prisma query.
- **Co-host:** server-side roster, NOT HMS peer detection (unreliable on iOS). "Raise hand" explicitly rejected.
- **Inline union generics in `.tsx`** misread as JSX — extract to named type/interface.

## Feature map

Live room Modes 1/2/3 (swipe / chat-bid / live buy-now), Max Bid proxy bidding, offers system, Buy Now→Auction conversion, full PayMongo order lifecycle + crons, seller application (multi-step form w/ ID photo upload + status guard + 48hr cooldown), photo upload (5 call sites, purpose-scoped), redesigned profile/feeds/activity, JWT refresh interceptor.

## Backlog

- **Admin panel** — no UI; `reviewApplication` (`PATCH /seller-applications/:id/review`) reachable only via raw API w/ ADMIN JWT. Needs own scoping session.
- **Consignment (dedicated session)** — `ShopItem.consignedToUserId` is DEAD: defined in schema (+ `consignedTo`/`consignedItems` relations) but never written or read anywhere in source. Making it work needs: (1) a write path to consign an item to a user (endpoint + host UI); (2) effective-seller derivation `item.consignedToUserId ?? item.sellerId` at the 5 order-creation sites — `bidding.gateway.ts` timer-win (~1234), auto-end win (~1865), buy-now claim (~1367), chat winner (~926), and `offers.service.ts` acceptOffer (~199) — order `sellerId` drives payout/shipping/GCash routing; (3) rewrite the self-bid guard (`bidding.service.ts:60` `auction.sellerId === bidderId`, gateway ~588 host/co-host block) to key off the effective owner so the host CAN win a consignor's item (order seller = consignor) but the consignor can't bid on their own.
- Prisma migration-drift cleanup (before prod migrate deploy); Prisma 5→7 upgrade (deferred)
- Push notifications; Winner announced in chat (Mode 2); PayMongo live mode; DB cleanup before TestFlight; Railway prod PG migration
- **Verify:** Cloudinary may reject new folder paths (`auxtion/seller-application/*`, `auxtion/payment-proof/*`) if account is preset/folder-restricted — test a real device upload.


---

## Session Summary — July 8, 2026

### Completed this session:
- **Full admin panel** (8 chunks): platform stats, application review (approve/reject/revoke), hub with console design system, user management (paginated list, search, role change with self-lockout guard), order oversight (status filters, pagination, force-cancel), dispute resolution (resolve for buyer/seller, transaction-safe), user-scoped order filter, searchable user-picker modal
- **Admin design system**: `apps/mobile/src/theme/admin.ts` (tokens) + `apps/mobile/src/theme/AdminUI.tsx` (shared components: AdminScreen, AdminHeader, Eyebrow, Card, StatTile, Badge, Tab, FilterChip, Mono). All 6 admin screens migrated to console design system.
- **Admin-account UI gating**: Profile (violet ADMIN badge, no buyer/seller UI, no Shipping Address/Payment Methods), Go Live (admin redirect to Admin Panel), Activity (admin redirect, hooks-order fix applied)
- **Admin backend**: `apps/api/src/modules/admin/` (AdminModule, AdminService, AdminController) registered in AppModule. Endpoints: `GET /admin/stats`, `GET /admin/users` (paginated+search), `PATCH /admin/users/:id/role`, `GET /admin/orders` (status+userId filters), `PATCH /admin/orders/:id/force-cancel`, `GET /admin/disputes`, `PATCH /admin/disputes/:id/resolve`. Seller application: `PATCH /seller-applications/:id/revoke`.
- **Security audit fixes** (via Claude Code): socket JWT auth, atomic bids, DB-sourced winner, atomic buy-now/offer-accept, streaming authz, payment-info gating, payout release, rate limiting (@nestjs/throttler), mobile refresh queue
- **ToS + Privacy Policy screens**: `apps/mobile/app/legal/terms.tsx`, `privacy.tsx`, wired into seller-application links
- **Live room crash fix**: `res.data.data.orders` response shape (seller orders endpoint returns `{orders:[...]}` not flat array)
- **Address endpoint fix**: `/users/me/address` → `/users/me/addresses` (singular→plural)
- **Confirm Receipt fix**: backend + mobile now accept SHIPPED orders (was gated on DELIVERED only)
- **DB cleanup**: wiped all test orders/bids/auctions/items/applications, preserved user accounts
- **Happy-path VERIFIED end-to-end**: auction→bid→win→PayMongo payment (webhook 200 OK)→ship→confirm receipt→COMPLETED+payout released

### Known gaps (not TestFlight blockers):
- Buy Now shop-tab placeholder ("Coming Soon" at live.tsx:3797) — needs wiring to actual buy-now claim flow
- GCash/Bank picker (currently shows both forms simultaneously)
- Completion ring still shows for admin profile (cosmetic)
- Consignment architecture (parked — consignedToUserId is dead schema field, 5 order-creation sites need effective-seller derivation)

### TestFlight blockers (remaining):
- **Railway deployment** — no production backend yet (locally only). Must deploy API + DB + Redis to Railway before TestFlight build. $5/month Hobby plan.
- **Production .env** — TestFlight build needs `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SOCKET_URL` pointing at Railway URL, not localhost
- PayMongo webhook URL needs updating from ngrok to Railway URL in PayMongo dashboard
- PayMongo is in TEST mode (fine for beta, needs live mode for real money)

### Test accounts:
- **Jim** (jim@gmail.com / Test1234!): role=ADMIN, displayName=Jimgh, id=cmple5wdt0000i2p8bz68em23
- **Micah** (micah@gmail.com / Test1234!): role=SELLER (re-approved this session), id=cmplebd910001i2p81zz3emhv
- **Jimboy**: buyer test account used for happy-path verification

### Architecture notes added:
- `AdminModule` is the single home for all admin-only backend logic (not scattered across existing controllers)
- Admin design system uses TS token object + StyleSheet (not NativeWind) for centralized control
- `AdminScreen` component bakes in `useSafeAreaInsets` — no admin screen hardcodes device padding
- Confirm Receipt accepts both SHIPPED and DELIVERED orders (no separate "mark delivered" step in current flow)
- PayMongo webhook configured at `/api/v1/payments/webhook/paymongo`, raw body preserved in main.ts
- The `if (isAdmin) return` early gate MUST be placed AFTER all React hooks in a component (hooks-order violation otherwise — fixed in activity.tsx, already correct in sell.tsx)
