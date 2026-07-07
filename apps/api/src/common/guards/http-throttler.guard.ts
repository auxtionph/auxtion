import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard that only rate-limits HTTP traffic. Registered globally via
 * APP_GUARD, which would otherwise also fire on WebSocket (`bidding.gateway`)
 * events — where `switchToHttp().getRequest()` is undefined and reading the
 * client IP would throw. Non-HTTP contexts pass straight through.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }
}
