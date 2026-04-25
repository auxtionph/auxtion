import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { OfferStatus, ShopItemStatus, ShopItemType } from '@prisma/client';
import { BiddingGateway } from '../bidding/bidding.gateway';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly biddingGateway: BiddingGateway,
  ) {}

  // ── Make Offer ─────────────────────────────────────────────────────────────

  async makeOffer(buyerId: string, dto: CreateOfferDto) {
    const item = await this.prisma.shopItem.findUnique({
      where: { id: dto.itemId },
    });

    if (!item) throw new NotFoundException('Item not found');

    if (item.type !== ShopItemType.BUY_NOW) {
      throw new BadRequestException('Offers can only be made on Buy Now items');
    }

    if (item.status !== ShopItemStatus.AVAILABLE) {
      throw new BadRequestException('This item is not available for offers');
    }

    if (item.sellerId === buyerId) {
      throw new BadRequestException(
        'You cannot make an offer on your own item',
      );
    }

    if (dto.amount < item.minimumOffer) {
      throw new BadRequestException(
        `Minimum offer is ${item.minimumOffer} centavos (70% of listed price)`,
      );
    }

    const existingOffer = await this.prisma.offer.findFirst({
      where: { itemId: dto.itemId, buyerId, status: OfferStatus.PENDING },
    });

    if (existingOffer) {
      throw new BadRequestException(
        'You already have a pending offer on this item',
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const offer = await this.prisma.offer.create({
      data: {
        itemId: dto.itemId,
        buyerId,
        sellerId: item.sellerId,
        amount: dto.amount,
        expiresAt,
        status: OfferStatus.PENDING,
      },
      include: {
        item: { select: { id: true, title: true, price: true, photos: true } },
        buyer: { select: { id: true, displayName: true } },
      },
    });

    const activeAuction = await this.prisma.auction.findFirst({
      where: {
        sellerId: item.sellerId,
        status: 'LIVE',
        shopItems: { some: { id: dto.itemId } },
      },
    });

    if (activeAuction) {
      this.biddingGateway.emitToAuction(activeAuction.id, 'offer-received', {
        offerId: offer.id,
        itemId: dto.itemId,
        itemTitle: item.title,
        buyerName: offer.buyer.displayName,
        amount: dto.amount,
        timestamp: Date.now(),
      });
    }

    return offer;
  }

  // ── Get My Offers (Buyer) ──────────────────────────────────────────────────

  async getMyOffers(buyerId: string) {
    return this.prisma.offer.findMany({
      where: { buyerId },
      include: {
        item: { select: { id: true, title: true, price: true, photos: true } },
        seller: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get Received Offers (Seller) ───────────────────────────────────────────

  async getReceivedOffers(sellerId: string, status?: OfferStatus) {
    return this.prisma.offer.findMany({
      where: { sellerId, ...(status ? { status } : {}) },
      include: {
        item: { select: { id: true, title: true, price: true, photos: true } },
        buyer: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Accept Offer ───────────────────────────────────────────────────────────

  async acceptOffer(sellerId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        item: true,
        buyer: { select: { displayName: true } },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.sellerId !== sellerId)
      throw new ForbiddenException('You do not own this offer');
    if (offer.status !== OfferStatus.PENDING)
      throw new BadRequestException('Offer is no longer pending');

    const accepted = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: OfferStatus.ACCEPTED },
    });

    await this.prisma.offer.updateMany({
      where: {
        itemId: offer.itemId,
        status: OfferStatus.PENDING,
        id: { not: offerId },
      },
      data: { status: OfferStatus.DECLINED },
    });

    await this.prisma.shopItem.update({
      where: { id: offer.itemId },
      data: { status: ShopItemStatus.SOLD },
    });

    const activeAuction = await this.prisma.auction.findFirst({
      where: {
        sellerId,
        status: 'LIVE',
        shopItems: { some: { id: offer.itemId } },
      },
    });

    if (activeAuction) {
      this.biddingGateway.emitToAuction(activeAuction.id, 'offer-responded', {
        offerId,
        status: 'ACCEPTED',
        itemTitle: offer.item.title,
        amount: offer.amount,
        buyerName: offer.buyer?.displayName ?? 'Buyer',
      });
      this.biddingGateway.emitToAuction(activeAuction.id, 'shop-updated', {
        auctionId: activeAuction.id,
        timestamp: Date.now(),
      });
    }

    return accepted;
  }

  // ── Decline Offer ──────────────────────────────────────────────────────────

  async declineOffer(sellerId: string, offerId: string, silent = false) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { item: { select: { title: true } } },
    });

    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.sellerId !== sellerId)
      throw new ForbiddenException('You do not own this offer');
    if (offer.status !== OfferStatus.PENDING)
      throw new BadRequestException('Offer is no longer pending');

    const declined = await this.prisma.offer.update({
      where: { id: offerId },
      data: { status: OfferStatus.DECLINED },
    });

    const activeAuction = await this.prisma.auction.findFirst({
      where: {
        sellerId,
        status: 'LIVE',
        shopItems: { some: { id: offer.itemId } },
      },
    });

    if (activeAuction && !silent) {
      this.biddingGateway.emitToAuction(activeAuction.id, 'offer-responded', {
        offerId,
        status: 'DECLINED',
        itemTitle: offer.item.title ?? '',
        amount: offer.amount,
      });
    }

    return declined;
  }

  // ── Cancel Offer (Buyer withdraws) ────────────────────────────────────────

  async cancelOffer(buyerId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
    });

    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.buyerId !== buyerId)
      throw new ForbiddenException('You did not make this offer');
    if (offer.status !== OfferStatus.PENDING)
      throw new BadRequestException('Offer is no longer pending');

    return this.prisma.offer.update({
      where: { id: offerId },
      data: { status: OfferStatus.CANCELLED },
    });
  }

  // ── Expire Offers ──────────────────────────────────────────────────────────

  async expireOffers() {
    const result = await this.prisma.offer.updateMany({
      where: { status: OfferStatus.PENDING, expiresAt: { lte: new Date() } },
      data: { status: OfferStatus.EXPIRED },
    });
    return { expired: result.count };
  }
}
