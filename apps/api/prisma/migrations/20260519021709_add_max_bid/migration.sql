-- CreateTable
CREATE TABLE "MaxBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaxBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaxBid_itemId_isActive_idx" ON "MaxBid"("itemId", "isActive");

-- CreateIndex
CREATE INDEX "MaxBid_userId_idx" ON "MaxBid"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MaxBid_itemId_userId_key" ON "MaxBid"("itemId", "userId");

-- AddForeignKey
ALTER TABLE "MaxBid" ADD CONSTRAINT "MaxBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaxBid" ADD CONSTRAINT "MaxBid_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "shop_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaxBid" ADD CONSTRAINT "MaxBid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
