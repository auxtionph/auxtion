-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'GCASH', 'MAYA', 'MANUAL');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_MANUAL_PAYMENT';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "commissionAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'chat',
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "processingFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sellerPayout" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingCity" TEXT,
ADD COLUMN     "shippingLine1" TEXT,
ADD COLUMN     "shippingName" TEXT,
ADD COLUMN     "shippingPhone" TEXT,
ADD COLUMN     "shippingPostalCode" TEXT,
ADD COLUMN     "shippingProvince" TEXT;

-- CreateTable
CREATE TABLE "user_addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
