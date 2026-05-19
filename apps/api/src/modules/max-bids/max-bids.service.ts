import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMaxBidDto } from './dto/create-max-bid.dto';

@Injectable()
export class MaxBidsService {
  constructor(private prisma: PrismaService) {}

  async upsert(userId: string, dto: CreateMaxBidDto) {
    const existing = await this.prisma.maxBid.findUnique({
      where: { itemId_userId: { itemId: dto.itemId, userId } },
    });
    if (existing && dto.amount <= existing.amount) {
      throw new BadRequestException('Max bid must be higher than your current max bid');
    }
    return this.prisma.maxBid.upsert({
      where: { itemId_userId: { itemId: dto.itemId, userId } },
      create: { ...dto, userId, isActive: true },
      update: { amount: dto.amount, isActive: true },
    });
  }

  async getActiveForItem(itemId: string) {
    return this.prisma.maxBid.findMany({
      where: { itemId, isActive: true },
      orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async getForUser(itemId: string, userId: string) {
    return this.prisma.maxBid.findUnique({
      where: { itemId_userId: { itemId, userId } },
    });
  }

  async deactivateForItem(itemId: string) {
    return this.prisma.maxBid.updateMany({
      where: { itemId, isActive: true },
      data: { isActive: false },
    });
  }
}
