ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "webhookEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_webhookEventId_key" 
  ON "payments"("webhookEventId");
