import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StreamingService } from './streaming.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { IsString, IsIn } from 'class-validator';

class GetTokenDto {
  @IsString()
  roomId: string;

  @IsIn(['broadcaster', 'viewer-realtime'])
  role: 'broadcaster' | 'viewer-realtime';
}

interface AuthUser {
  id: string;
  role: UserRole;
}

@Controller('streaming')
@UseGuards(JwtAuthGuard)
export class StreamingController {
  constructor(private readonly streamingService: StreamingService) {}

  @Post('token')
  @HttpCode(HttpStatus.OK)
  async getToken(@CurrentUser() user: AuthUser, @Body() dto: GetTokenDto) {
    const token = await this.streamingService.generateToken(
      dto.roomId,
      user.id,
      dto.role,
    );
    return { token };
  }
}
