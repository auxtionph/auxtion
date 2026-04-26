---
name: auxtion-architecture
description: "Use this skill whenever working on any Auxtion feature — backend or frontend. Contains the complete system architecture, conventions, patterns, socket events, API structure, and deploy workflow. Read this before adding any new module, screen, socket event, or database migration."
---

# Auxtion System Architecture

## Stack

| Layer | Technology |
|---|---|
| Backend | NestJS + PostgreSQL + Redis + Socket.IO |
| Frontend | React Native (Expo) |
| Live video | 100ms.live |
| Database hosting | Railway |
| ORM | Prisma |
| Payments (planned) | PayMongo |
| Media upload (planned) | Cloudinary via expo-image-picker |
| Monorepo | Turborepo |

## Key Identifiers

```
DB (public):     maglev.proxy.rlwy.net:47483
API (prod):      https://auxtion-production.up.railway.app/api/v1
Repo:            https://github.com/auxtionph/auxtion.git
Working dir:     ~/Documents/Auxtion/Auxtion/auxtion
Deploy:          push to main → Railway auto-deploys
```

## Monorepo Structure

```
auxtion/
├── apps/
│   ├── api/          # NestJS backend
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       └── modules/
│   │           ├── auctions/
│   │           ├── bidding/       # Socket.IO gateway lives here
│   │           ├── offers/
│   │           ├── shop-items/
│   │           └── auth/
│   └── mobile/       # React Native (Expo)
│       ├── app/
│       │   ├── (main)/            # Tab navigation
│       │   └── auction/[id]/
│       │       └── live.tsx       # Live room — main feature file
│       └── src/
│           ├── hooks/
│           │   ├── useSocket.ts   # All socket event subscriptions
│           │   └── useHMS.ts      # 100ms video hook
│           ├── services/
│           │   ├── api/
│           │   │   ├── client.ts  # Axios + JWT refresh interceptor
│           │   │   ├── auctions.api.ts
│           │   │   ├── shop-items.api.ts
│           │   │   └── offers.api.ts
│           │   └── socket/
│           │       ├── socket.client.ts
│           │       └── socket.events.ts
│           └── stores/
│               └── auth.store.ts  # Zustand auth store
└── packages/
    └── utils/         # Shared utilities e.g. formatPHP()
```

## Seller Test Account

```
email:       jim@gmail.com
displayName: Jimgh
userId:      cmn8j279a000149qpown5avj6
```

---

## Backend Conventions

### NestJS Module Pattern

Every module follows:
```
modules/foo/
├── foo.module.ts
├── foo.controller.ts
├── foo.service.ts
└── dto/
    ├── create-foo.dto.ts
    └── update-foo.dto.ts
```

### Response Shape

All responses are wrapped by `ResponseInterceptor`:
```json
{ "data": { ...actualPayload } }
```
Frontend must read `response.data.data` for actual values.

### Auth Guards

```typescript
@UseGuards(JwtAuthGuard)        // standard JWT
@UseGuards(RefreshAuthGuard)    // for token refresh endpoint
```

Current user injected via `@CurrentUser() user: AuthUser`.

### API Conventions

- `GET /resource` — list
- `POST /resource` — create
- `PATCH /resource/:id` — partial update
- `DELETE /resource/:id` — soft delete (sets status to CANCELLED/DELETED)
- All money values are in **centavos** (₱1 = 100 centavos)

### JWT Config (Railway env vars)

```
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

---

## Database Conventions

### Prisma Schema Rules

- All IDs use `cuid()` default
- All timestamps use `@default(now())` and `@updatedAt`
- Soft deletes preferred — use status fields not hard deletes
- Money stored as `Int` in centavos

### Migration Workflow

**ALWAYS use the public Railway URL locally. Never use internal URL.**

```bash
cd apps/api

# Create migration
DATABASE_URL="postgresql://postgres:PASSWORD@maglev.proxy.rlwy.net:47483/railway" \
  npx prisma migrate dev --name describe_change

# Apply to prod (auto on Railway deploy, but can force)
DATABASE_URL="postgresql://..." npx prisma migrate deploy

# Reset (dev only)
DATABASE_URL="postgresql://..." npx prisma migrate reset
```

Never run migrations from repo root — always from `apps/api/`.

---

## Socket Architecture

### Gateway

`apps/api/src/modules/bidding/bidding.gateway.ts`

All socket logic lives here. Rooms named `auction:${auctionId}`.

```typescript
// Emit to entire room (all connected clients)
this.biddingGateway.emitToAuction(auctionId, 'event-name', payload);
```

### Frontend Socket Hook

`apps/mobile/src/hooks/useSocket.ts`

- Connects once per auction room
- Registers all listeners in `setupSocket()`
- Always emits `JOIN_AUCTION` last after all listeners are registered
- Sellers join with `{ auctionId, token, sellerId: userId }`

### Socket Events Reference

| Event | Direction | Description |
|---|---|---|
| `join-auction` | Client → Server | Join room |
| `leave-auction` | Client → Server | Leave room |
| `place-bid` | Client → Server | Place a bid |
| `bid-update` | Server → Room | New bid, updates current price |
| `bid-confirmed` | Server → Bidder | Bid accepted |
| `bid-error` | Server → Bidder | Bid rejected |
| `chat-message` | Client → Server | Send chat |
| `chat-received` | Server → Room | New chat message |
| `chat-history` | Server → Joiner | Last N messages on join |
| `start-item-timer` | Client → Server | Seller starts swipe auction |
| `timer-started` | Server → Room | Timer began |
| `timer-update` | Server → Room | Tick update |
| `timer-ended` | Server → Room | Timer expired |
| `timer-paused` | Server → Room | Seller disconnected |
| `timer-resumed` | Server → Room | Seller reconnected |
| `pause-item-timer` | Client → Server | Pause timer |
| `resume-item-timer` | Client → Server | Resume timer |
| `cancel-item-timer` | Client → Server | Cancel item |
| `start-chat-bid` | Client → Server | Seller starts chat bid mode |
| `declare-chat-winner` | Client → Server | Seller crowns winner |
| `skip-chat-item` | Client → Server | Seller skips item (no sale) |
| `item-started` | Server → Room | Item is now live |
| `item-ended` | Server → Room | Item sold or skipped |
| `viewer-count` | Server → Room | Current viewer count |
| `auction-ended` | Server → Room | Auction ended |
| `shop-updated` | Server → Room | Shop items changed |
| `notify-shop-updated` | Client → Server | Trigger shop refresh |
| `offer-received` | Server → Room | New offer on Buy Now item |
| `offer-responded` | Server → Room | Offer accepted/declined |
| `bid-state` | Server → Joiner | Current bid state on join |

---

## Frontend Conventions

### UI Rules (strictly enforced)

```typescript
// ALWAYS — never hardcode device-specific values
const insets = useSafeAreaInsets();
paddingTop: insets.top + 12
paddingBottom: insets.bottom + 8

// NEVER
paddingTop: 56
paddingBottom: 40
```

### Glassmorphism Style

```typescript
backgroundColor: 'rgba(255,255,255,0.15)'
borderWidth: 1
borderColor: 'rgba(255,255,255,0.25)'
```

### Money Formatting

```typescript
import { formatPHP } from '@auxtion/utils';
formatPHP(amountInCentavos) // → "₱1,000.00"
```

### Live Room Layout System

Bottom bar height is computed dynamically — never hardcode:

```typescript
const BOTTOM_PADDING = keyboardHeight > 0 ? 12 : insets.bottom + 8;
const CHAT_ROW_HEIGHT = 60;
const ACTION_HEIGHT = isSeller ? SELLER_BUTTON_HEIGHT : BUYER_BUTTON_HEIGHT;
const BOTTOM_BAR_HEIGHT = BOTTOM_PADDING + 12 + CHAT_ROW_HEIGHT + ACTION_HEIGHT;
const ITEM_BAR_BOTTOM = BOTTOM_BAR_HEIGHT + 8;
const CONTROLS_BOTTOM = ITEM_BAR_BOTTOM + (currentItem ? 76 : 0);
```

### Ref Pattern for Socket Closures

Socket callbacks are registered once and can go stale. Always use refs:

```typescript
const currentItemRef = useRef<CurrentItem | null>(null);
useEffect(() => { currentItemRef.current = currentItem; }, [currentItem]);

// In socket callback — read from ref, never from state directly
const latest = currentItemRef.current;
```

### Optimistic Updates Pattern

```typescript
// 1. Update UI immediately
setCurrentItem(prev => ({ ...prev, currentPrice: bidAmount }));

// 2. Emit to server
placeBid(itemId, bidAmount, userId);

// 3. Server confirms via socket — onBidUpdate overwrites with real data
```

### API Client

`apps/mobile/src/services/api/client.ts`

- Base URL: `https://auxtion-production.up.railway.app/api/v1`
- Auth: Bearer token from SecureStore `accessToken`
- 401 interceptor: reads `refreshToken` → calls `POST /auth/refresh` → rotates both tokens → retries original request
- Concurrent 401s are queued during refresh

---

## Live Auction Modes

### Mode 1 — Swipe Auction

- Timer-based (seller sets start seconds + counterbid window)
- Each bid resets timer to counterbid window
- Server auto-sells to highest bidder when timer hits 0
- Frontend: swipe-to-bid button

### Mode 2 — Chat Bid

- Buyers type bids in chat
- Seller taps 👑 on a chat message to declare winner
- Seller sets optional display timer
- No auto-sell — seller controls everything
- Frontend: "Type your bid in chat" prompt

### Item Lifecycle

```
QUEUED → LIVE → SOLD (winner) | QUEUED (skipped/no-sale)
BUY_NOW AVAILABLE → SOLD (purchased/offer accepted)
BUY_NOW → AUCTION (convertToAuction endpoint)
```

---

## Key Endpoints

```
POST   /auth/login
POST   /auth/refresh             # Bearer: refreshToken header
POST   /auctions                 # Create auction
GET    /auctions/active          # Seller's active auction
GET    /auctions/:id             # Full auction detail with shopItems
PATCH  /auctions/:id/end         # End auction

POST   /shop-items               # Create item
PATCH  /shop-items/:id           # Update item (price, title etc)
PATCH  /shop-items/:id/reset     # Reset LIVE item back to QUEUED
PATCH  /shop-items/:id/convert-to-auction  # BUY_NOW → AUCTION at new price
POST   /auctions/:id/items/:itemId         # Add item to auction

POST   /offers                   # Buyer makes offer
PATCH  /offers/:id/accept        # Seller accepts
PATCH  /offers/:id/decline       # Seller declines
PATCH  /offers/:id/decline?silent=true  # Decline without notifying buyer
PATCH  /offers/:id/cancel        # Buyer withdraws
```

---

## Deploy Workflow

```bash
# Feature development
git checkout develop
# ... make changes ...
git add -A && git commit -m "feat/fix: description"
git push origin develop

# Deploy to production
git checkout main
git merge develop
git push origin main   # triggers Railway auto-deploy
git checkout develop
```

Railway deploys on every push to `main`. Logs visible in Railway dashboard.

---

## Pending Backlog

- Photo upload (expo-image-picker + Cloudinary/S3)
- PayMongo payment flow
- Order system post-sale
- Winner buyer name in sold tab (requires orders)
- Viewer count deduplication by userId
- Reaction emojis
- Seller queue reordering
- Push notifications (expo-notifications)