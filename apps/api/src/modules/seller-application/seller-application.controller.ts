import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SellerApplicationService } from './seller-application.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SellerApplicationStatus, UserRole } from '@prisma/client';

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

@Controller('seller-applications')
@UseGuards(JwtAuthGuard)
export class SellerApplicationController {
  constructor(
    private readonly sellerApplicationService: SellerApplicationService,
  ) {}

  @Post()
  apply(@CurrentUser() user: AuthUser, @Body() dto: CreateApplicationDto) {
    return this.sellerApplicationService.apply(user.id, dto);
  }

  @Get('me')
  getMyApplication(@CurrentUser() user: AuthUser) {
    return this.sellerApplicationService.getMyApplication(user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  getAllApplications(@Query('status') status?: SellerApplicationStatus) {
    return this.sellerApplicationService.getAllApplications(status);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  getApplicationById(@Param('id') id: string) {
    return this.sellerApplicationService.getApplicationById(id);
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  reviewApplication(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
  ) {
    return this.sellerApplicationService.reviewApplication(user.id, id, dto);
  }

  @Patch(':id/revoke')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  revokeApplication(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A reason is required when revoking a seller');
    }
    return this.sellerApplicationService.revokeApplication(user.id, id, reason.trim());
  }
}
import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
  IsArray,
} from 'class-validator';
import { ShopItemType } from '@prisma/client';

export class CreateShopItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  title: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description: string;

  @IsArray()
  @IsString({ each: true })
  photos: string[];

  @IsInt()
  @Min(1)
  price: number; // centavos

  @IsEnum(ShopItemType)
  type: ShopItemType;

  @IsOptional()
  @IsInt()
  queueOrder?: number;
}
