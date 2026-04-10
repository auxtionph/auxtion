-- CreateTable
CREATE TABLE "auction_chat_messages" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auction_chat_messages_auctionId_createdAt_idx" ON "auction_chat_messages"("auctionId", "createdAt");

-- AddForeignKey
ALTER TABLE "auction_chat_messages" ADD CONSTRAINT "auction_chat_messages_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
