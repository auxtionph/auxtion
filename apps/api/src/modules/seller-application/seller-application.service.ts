import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';
import { UserRole, SellerApplicationStatus } from '@prisma/client';

@Injectable()
export class SellerApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Apply ──────────────────────────────────────────────────────────────────

  async apply(userId: string, dto: CreateApplicationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { sellerApplication: true },
    });

    if (!user) throw new NotFoundException('User not found');

    if (user.role === UserRole.SELLER) {
      throw new BadRequestException('You are already a seller');
    }

    if (user.sellerApplication) {
      const { status } = user.sellerApplication;
      if (status === SellerApplicationStatus.PENDING) {
        throw new BadRequestException('You already have a pending application');
      }
      if (status === SellerApplicationStatus.APPROVED) {
        throw new BadRequestException('Your application is already approved');
      }
    }

    const application = await this.prisma.sellerApplication.upsert({
      where: { userId },
      create: {
        userId,
        fullName: dto.fullName,
        idImageUrl: dto.idImageUrl,
        contactNo: dto.contactNo,
        description: dto.description,
        payoutInfo: dto.payoutInfo,
        status: SellerApplicationStatus.PENDING,
      },
      update: {
        fullName: dto.fullName,
        idImageUrl: dto.idImageUrl,
        contactNo: dto.contactNo,
        description: dto.description,
        payoutInfo: dto.payoutInfo,
        status: SellerApplicationStatus.PENDING,
        rejectedReason: null,
      },
    });

    return application;
  }

  // ── Get My Application ─────────────────────────────────────────────────────

  async getMyApplication(userId: string) {
    const application = await this.prisma.sellerApplication.findUnique({
      where: { userId },
    });

    if (!application) {
      throw new NotFoundException('No application found');
    }

    return application;
  }

  // ── Admin: Get All Applications ────────────────────────────────────────────

  async getAllApplications(status?: SellerApplicationStatus) {
    return this.prisma.sellerApplication.findMany({
      where: status ? { status } : undefined,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Admin: Get Single Application ──────────────────────────────────────────

  async getApplicationById(applicationId: string) {
    const application = await this.prisma.sellerApplication.findUnique({
      where: { id: applicationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
            createdAt: true,
          },
        },
      },
    });

    if (!application) throw new NotFoundException('Application not found');

    return application;
  }

  // ── Admin: Review Application ──────────────────────────────────────────────

  async reviewApplication(
    adminId: string,
    applicationId: string,
    dto: ReviewApplicationDto,
  ) {
    const application = await this.prisma.sellerApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) throw new NotFoundException('Application not found');

    if (application.status !== SellerApplicationStatus.PENDING) {
      throw new BadRequestException('Application has already been reviewed');
    }

    if (
      dto.status === SellerApplicationStatus.REJECTED &&
      !dto.rejectedReason
    ) {
      throw new BadRequestException(
        'A reason is required when rejecting an application',
      );
    }

    const updated = await this.prisma.sellerApplication.update({
      where: { id: applicationId },
      data: {
        status: dto.status,
        rejectedReason: dto.rejectedReason ?? null,
        reviewedBy: adminId,
      },
    });

    // If approved, upgrade user role to SELLER
    if (dto.status === SellerApplicationStatus.APPROVED) {
      await this.prisma.user.update({
        where: { id: application.userId },
        data: { role: UserRole.SELLER },
      });
    }

    return updated;
  }
}
