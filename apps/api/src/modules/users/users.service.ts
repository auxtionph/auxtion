import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SaveAddressDto } from './dto/save-address.dto';
import { SavePaymentMethodsDto } from './dto/save-payment-methods.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        phone: true,
        role: true,
        sellerTier: true,
        totalSales: true,
        isVerified: true,
        createdAt: true,
        gcashNumber: true,
        gcashName: true,
        bankName: true,
        bankAccountNumber: true,
        bankAccountName: true,
        paymentInfoUpdatedAt: true,
        sellerApplication: {
          select: { status: true, createdAt: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ── Profile Status (used by mobile gate check) ──────────────────────────
  async getProfileStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        gcashNumber: true,
        gcashName: true,
        bankName: true,
        bankAccountNumber: true,
        bankAccountName: true,
        addresses: {
          where: { isDefault: true },
          select: {
            id: true,
            name: true,
            phone: true,
            line1: true,
            city: true,
            province: true,
            postalCode: true,
          },
          take: 1,
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const address = user.addresses[0] ?? null;
    const hasAddress = !!address;
    const hasGcash = !!(user.gcashNumber && user.gcashName);
    const hasBank = !!(
      user.bankName &&
      user.bankAccountNumber &&
      user.bankAccountName
    );
    const hasPaymentMethod = hasGcash || hasBank;

    return {
      isComplete: hasAddress && hasPaymentMethod,
      hasAddress,
      hasPaymentMethod,
      address,
      paymentMethods: {
        gcash: hasGcash
          ? { number: user.gcashNumber, name: user.gcashName }
          : null,
        bank: hasBank
          ? {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              name: user.bankName,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              accountNumber: user.bankAccountNumber,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              accountName: user.bankAccountName,
            }
          : null,
      },
    };
  }

  // ── Save / Update Default Address ──────────────────────────────────────
  async saveAddress(userId: string, dto: SaveAddressDto) {
    // Unset any existing default, then create new default in one transaction
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const [, address] = await this.prisma.$transaction([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.prisma.userAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.prisma.userAddress.create({
        data: {
          userId,
          name: dto.name,
          phone: dto.phone,
          line1: dto.line1,
          city: dto.city,
          province: dto.province,
          postalCode: dto.postalCode,
          isDefault: true,
        },
      }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return address;
  }

  // ── Save / Update Payment Methods ──────────────────────────────────────
  async savePaymentMethods(userId: string, dto: SavePaymentMethodsDto) {
    const hasGcash = dto.gcashNumber && dto.gcashName;
    const hasBank =
      dto.bankName && dto.bankAccountNumber && dto.bankAccountName;

    if (!hasGcash && !hasBank) {
      throw new BadRequestException(
        'Provide at least one payment method (GCash or Bank).',
      );
    }

    // Validate PH GCash number format
    if (dto.gcashNumber && !/^09\d{9}$/.test(dto.gcashNumber)) {
      throw new BadRequestException(
        'GCash number must be 11 digits starting with 09.',
      );
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        gcashNumber: dto.gcashNumber ?? null,
        gcashName: dto.gcashName ?? null,
        bankName: dto.bankName ?? null,
        bankAccountNumber: dto.bankAccountNumber ?? null,
        bankAccountName: dto.bankAccountName ?? null,
        paymentInfoUpdatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        gcashNumber: true,
        gcashName: true,
        bankName: true,
        bankAccountNumber: true,
        bankAccountName: true,
        paymentInfoUpdatedAt: true,
      },
    });

    // Security push notification
    void this.notifications.sendToUser(userId, {
      title: '🔐 Payment details updated',
      body: "Your GCash/bank info was just changed. If this wasn't you, contact support immediately.",
      data: { screen: 'payment-settings' },
    });

    this.logger.log(
      `Payment info updated for user ${userId} at ${new Date().toISOString()}`,
    );

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName && { displayName: dto.displayName }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.avatarUrl && { avatarUrl: dto.avatarUrl }),
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        phone: true,
        role: true,
        updatedAt: true,
      },
    });
    return user;
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        sellerTier: true,
        totalSales: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async searchUsers(search: string) {
    if (!search?.trim()) return [];
    return this.prisma.user.findMany({
      where: {
        displayName: { contains: search, mode: 'insensitive' },
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        sellerTier: true,
        totalSales: true,
      },
      take: 20,
    });
  }

  async savePushToken(userId: string, token: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushToken: token },
    });
    return { saved: true };
  }
}
