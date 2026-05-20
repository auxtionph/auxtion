/*
  Warnings:

  - The `photos` column on the `shop_items` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "shop_items" DROP COLUMN "photos",
ADD COLUMN     "photos" JSONB NOT NULL DEFAULT '[]';
