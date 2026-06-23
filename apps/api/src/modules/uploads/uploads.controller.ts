import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

interface AuthUser {
  id: string;
  role: UserRole;
}

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get('signature')
  getSignature(
    @CurrentUser() user: AuthUser,
    @Query('purpose') purpose: string,
  ) {
    return this.uploadsService.getSignature(user.id, purpose);
  }
}
