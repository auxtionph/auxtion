import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';
import { UserRole, SellerApplicationStatus } from '@prisma/client';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class SellerApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  // ── Apply ──────────────────────────────────────────────────────────────────

  private maskIdNumber(idNumber: string): string {
    const trimmed = idNumber.trim();
    if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
    return '*'.repeat(trimmed.length - 4) + trimmed.slice(-4);
  }

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
      const { status, updatedAt } = user.sellerApplication;
      if (status === SellerApplicationStatus.PENDING) {
        throw new BadRequestException('You already have a pending application');
      }
      if (status === SellerApplicationStatus.APPROVED) {
        throw new BadRequestException('Your application is already approved');
      }
      if (status === SellerApplicationStatus.REJECTED) {
        const cooldownMs = 48 * 60 * 60 * 1000;
        const elapsedMs = Date.now() - updatedAt.getTime();
        if (elapsedMs < cooldownMs) {
          const hoursLeft = Math.ceil((cooldownMs - elapsedMs) / (60 * 60 * 1000));
          throw new BadRequestException(
            `You can resubmit in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}`,
          );
        }
      }
    }
    const idNumberMasked = this.maskIdNumber(dto.idNumber);

    // If replacing a previous ID photo with a new one, clean up the orphaned asset
    const previousPublicId = user.sellerApplication?.idImagePublicId;
    if (
      previousPublicId &&
      dto.idImagePublicId &&
      previousPublicId !== dto.idImagePublicId
    ) {
      await this.uploadsService.deletePhoto(previousPublicId);
    }

    const application = await this.prisma.sellerApplication.upsert({
      where: { userId },
      create: {
        userId,
        fullName: dto.fullName,
        idImageUrl: dto.idImageUrl ?? null,
        idImagePublicId: dto.idImagePublicId ?? null,
        idType: dto.idType,
        idNumberMasked,
        contactNo: dto.contactNo,
        description: dto.description,
        payoutInfo: dto.payoutInfo,
        status: SellerApplicationStatus.PENDING,
      },
      update: {
        fullName: dto.fullName,
        idImageUrl: dto.idImageUrl ?? null,
        idImagePublicId: dto.idImagePublicId ?? null,
        idType: dto.idType,
        idNumberMasked,
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

    const [updated] = await this.prisma.$transaction([
      this.prisma.sellerApplication.update({
        where: { id: applicationId },
        data: {
          status: dto.status,
          rejectedReason: dto.rejectedReason ?? null,
          reviewedBy: adminId,
        },
      }),
      ...(dto.status === SellerApplicationStatus.APPROVED
        ? [
            this.prisma.user.update({
              where: { id: application.userId },
              data: { role: UserRole.SELLER },
            }),
          ]
        : []),
    ]);

    return updated;
  }
}
