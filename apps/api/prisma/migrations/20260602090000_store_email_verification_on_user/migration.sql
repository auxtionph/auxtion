-- Store email verification tokens on users as SHA-256 hashes.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "verificationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_verificationToken_key"
  ON "users"("verificationToken");

DROP TABLE IF EXISTS "verification_tokens";
