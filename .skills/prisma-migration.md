---
name: prisma-migration
description: "Use this skill whenever a Prisma schema change, migration, or database operation is needed for Auxtion. Contains the exact commands, Railway URL requirements, and common patterns. ALWAYS read before running any migration."
---

# Prisma Migrations — Auxtion

## Critical Rule

**The internal Railway DB URL does NOT work locally.**
Always use the PUBLIC Railway URL for all local Prisma operations.

```
PUBLIC:   postgresql://postgres:PASSWORD@maglev.proxy.rlwy.net:47483/railway
INTERNAL: postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway  ← NEVER use locally
```

The password is in Railway → auxtion project → postgres service → Variables → `POSTGRES_PASSWORD`.

---

## Always Run From `apps/api/`

```bash
cd ~/Documents/Auxtion/Auxtion/auxtion/apps/api
```

Never run Prisma commands from the monorepo root — the schema path won't resolve.

---

## Common Commands

### Create a new migration

```bash
DATABASE_URL="postgresql://postgres:PASSWORD@maglev.proxy.rlwy.net:47483/railway" \
  npx prisma migrate dev --name your_migration_name
```

Naming convention: `snake_case` describing what changed.
Examples: `add_mode_to_shop_item`, `add_actual_start_time_to_auction`, `create_offers_table`

### Apply pending migrations (prod)

Railway runs this automatically on deploy. Force manually:

```bash
DATABASE_URL="postgresql://postgres:PASSWORD@maglev.proxy.rlwy.net:47483/railway" \
  npx prisma migrate deploy
```

### Inspect current DB state

```bash
DATABASE_URL="postgresql://postgres:PASSWORD@maglev.proxy.rlwy.net:47483/railway" \
  npx prisma db pull
```

### Open Prisma Studio (DB browser)

```bash
DATABASE_URL="postgresql://postgres:PASSWORD@maglev.proxy.rlwy.net:47483/railway" \
  npx prisma studio
```

### Generate Prisma client after schema change

```bash
npx prisma generate
```

Run this after editing `schema.prisma` before running the app locally.

### Reset DB (dev only — DESTROYS ALL DATA)

```bash
DATABASE_URL="postgresql://postgres:PASSWORD@maglev.proxy.rlwy.net:47483/railway" \
  npx prisma migrate reset
```

---

## Schema Location

```
apps/api/prisma/schema.prisma
```

---

## Schema Conventions

```prisma
model Example {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Money stored as Int in centavos (₱1 = 100)
  price     Int

  // Soft delete — use status enum, never hard delete
  status    ExampleStatus @default(ACTIVE)
}

enum ExampleStatus {
  ACTIVE
  CANCELLED
}
```

### Rules

- IDs: always `@id @default(cuid())`
- Timestamps: always include `createdAt` + `updatedAt`
- Money: always `Int` in centavos
- Deletes: always soft (status field), never `deleteMany` in production
- Relations: always define both sides with `@relation`

---

## Adding a Field — Full Workflow

1. Edit `apps/api/prisma/schema.prisma`
2. Run migration:
   ```bash
   cd apps/api
   DATABASE_URL="postgresql://..." npx prisma migrate dev --name add_field_to_model
   ```
3. Run generate:
   ```bash
   npx prisma generate
   ```
4. Update service to select/include the new field
5. Update TypeScript types in frontend if exposed via API
6. Commit everything including the generated migration file in `prisma/migrations/`

---

## Adding a New Model — Full Workflow

1. Add model + enum to `schema.prisma`
2. Create migration (step above)
3. Create NestJS module:
   ```
   apps/api/src/modules/new-model/
   ├── new-model.module.ts
   ├── new-model.controller.ts
   ├── new-model.service.ts
   └── dto/
       ├── create-new-model.dto.ts
       └── update-new-model.dto.ts
   ```
4. Register in `apps/api/src/app.module.ts`
5. Inject `PrismaService` in the service constructor

---

## Common Migration Errors

### "P1001: Can't reach database server"
→ You're using the internal URL. Switch to `maglev.proxy.rlwy.net:47483`.

### "Migration failed to apply cleanly"
→ Check if the column already exists. May need to use `--create-only` then edit the SQL before applying.

### "The migration is not found in the migrations folder"
→ You're running from the wrong directory. `cd apps/api` first.

### Prisma client out of sync after schema change
→ Run `npx prisma generate` from `apps/api/`.

---

## Railway Env Vars Reference

Set in Railway → auxtion-api service → Variables:

```
DATABASE_URL          # Internal URL (used by Railway containers)
JWT_SECRET
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
REDIS_URL
HMS_ACCESS_KEY
HMS_SECRET
```

The public URL (`maglev.proxy.rlwy.net:47483`) is only for local access — Railway containers always use the internal URL automatically.