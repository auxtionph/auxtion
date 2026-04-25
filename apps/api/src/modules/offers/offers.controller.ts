import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OfferStatus, UserRole } from '@prisma/client';

interface AuthUser {
  id: string;
  role: UserRole;
}

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  // Buyer makes an offer
  @Post()
  makeOffer(@CurrentUser() user: AuthUser, @Body() dto: CreateOfferDto) {
    return this.offersService.makeOffer(user.id, dto);
  }

  // Buyer views their sent offers
  @Get('my-offers')
  getMyOffers(@CurrentUser() user: AuthUser) {
    return this.offersService.getMyOffers(user.id);
  }

  // Seller views received offers
  @Get('received')
  getReceivedOffers(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: OfferStatus,
  ) {
    return this.offersService.getReceivedOffers(user.id, status);
  }

  // Seller accepts an offer
  @Patch(':id/accept')
  @HttpCode(HttpStatus.OK)
  acceptOffer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offersService.acceptOffer(user.id, id);
  }

  // Seller declines an offer
  @Patch(':id/decline')
  @HttpCode(HttpStatus.OK)
  declineOffer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('silent') silent?: string,
  ) {
    return this.offersService.declineOffer(user.id, id, silent === 'true');
  }

  // Buyer cancels their offer
  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelOffer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.offersService.cancelOffer(user.id, id);
  }
}
