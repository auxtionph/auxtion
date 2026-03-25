import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
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
}
