import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SaveAddressDto } from './dto/save-address.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';import { SavePaymentMethodsDto } from './dto/save-payment-methods.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface AuthUser {
  id: string;
  email: string;
  role: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  searchUsers(@Query('search') search: string) {
    return this.usersService.searchUsers(search);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getMe(user.id);
  }

  @Get('me/profile-status')
  getProfileStatus(@CurrentUser() user: AuthUser) {
    return this.usersService.getProfileStatus(user.id);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('me/address')
  saveAddress(@CurrentUser() user: AuthUser, @Body() dto: SaveAddressDto) {
    return this.usersService.saveAddress(user.id, dto);
  }

  @Post('me/push-token')
  savePushToken(
    @CurrentUser() user: AuthUser,
    @Body() body: { token: string },
  ) {
    return this.usersService.savePushToken(user.id, body.token);
  }

  @Patch('me/payment-methods')
  savePaymentMethods(
    @CurrentUser() user: AuthUser,
    @Body() dto: SavePaymentMethodsDto,
  ) {
    return this.usersService.savePaymentMethods(user.id, dto);
  }

// ── Multi-address CRUD ──────────────────────────────────────────────────
  @Get('me/addresses')
  listAddresses(@CurrentUser() user: AuthUser) {
    return this.usersService.listAddresses(user.id);
  }

  @Post('me/addresses')
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: CreateAddressDto) {
    return this.usersService.createAddress(user.id, dto);
  }

  @Patch('me/addresses/:id')
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(user.id, id, dto);
  }

  @Patch('me/addresses/:id/default')
  setDefaultAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.setDefaultAddress(user.id, id);
  }

  @Delete('me/addresses/:id')
  deleteAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.usersService.deleteAddress(user.id, id);
  }  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }
}
