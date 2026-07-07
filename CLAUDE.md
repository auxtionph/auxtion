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
- Prisma migration-drift cleanup (before prod migrate deploy); Prisma 5→7 upgrade (deferred)
- Push notifications; Winner announced in chat (Mode 2); PayMongo live mode; DB cleanup before TestFlight; Railway prod PG migration
- **Verify:** Cloudinary may reject new folder paths (`auxtion/seller-application/*`, `auxtion/payment-proof/*`) if account is preset/folder-restricted — test a real device upload.
