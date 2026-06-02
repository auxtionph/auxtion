import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../common/email/email.service';
import { RedisService } from '../../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly verificationTtlMs = 24 * 60 * 60 * 1000;
  private readonly resendWindowSeconds = 60 * 60;
  private readonly resendLimit = 3;
  private readonly genericResendMessage =
    'If this email is registered and unverified, a new link has been sent.';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        displayName: dto.displayName,
        phone: dto.phone,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isVerified: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });

    const verificationEmailSent = await this.trySendVerificationByUserId(
      user.id,
    );

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return { user, verificationEmailSent, ...tokens };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    if (!user.isEmailVerified) {
      throw new ForbiddenException(
        'Please verify your email before logging in.',
      );
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        isVerified: user.isVerified,
        isEmailVerified: user.isEmailVerified,
      },
      ...tokens,
    };
  }

  async sendVerification(userId: string) {
    await this.enforceResendRateLimit(`user:${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isEmailVerified: true },
    });

    if (!user) throw new NotFoundException('User not found');

    if (user.isEmailVerified) {
      return { message: 'Email is already verified' };
    }

    await this.issueVerificationEmail(user.id, user.email);

    return { message: 'Verification email sent' };
  }

  async resendVerification(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    await this.enforceResendRateLimit(`email:${normalizedEmail}`);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, isEmailVerified: true },
    });

    if (!user) {
      return { message: this.genericResendMessage };
    }

    if (user.isEmailVerified) {
      throw new HttpException(
        'Your email is already verified. Please log in.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.issueVerificationEmail(user.id, user.email);

    return { message: this.genericResendMessage };
  }

  private async issueVerificationEmail(userId: string, email: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        verificationToken: null,
        verificationTokenExpiresAt: null,
      },
    });

    const token = this.generateVerificationToken();
    const hashedToken = this.hashVerificationToken(token);
    const expiresAt = new Date(Date.now() + this.verificationTtlMs);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        verificationToken: hashedToken,
        verificationTokenExpiresAt: expiresAt,
      },
    });

    const baseUrl = this.configService.get<string>(
      'EMAIL_VERIFICATION_BASE_URL',
      'https://auxtion-production.up.railway.app/api/v1',
    );
    const verificationLink = `${baseUrl}/auth/verify-email?token=${token}`;
    this.logVerificationLink(email, verificationLink);

    await this.emailService.sendVerificationEmail(email, verificationLink);
  }

  async verifyEmail(token: string | undefined, userAgent: string | undefined) {
    if (!token) {
      return this.buildVerificationPage('invalid');
    }

    const hashedToken = this.hashVerificationToken(token);
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: hashedToken },
      select: {
        id: true,
        verificationTokenExpiresAt: true,
        isEmailVerified: true,
      },
    });

    if (!user) {
      return this.buildVerificationPage('invalid');
    }

    if (!user.verificationTokenExpiresAt) {
      return this.buildVerificationPage('used');
    }

    if (user.verificationTokenExpiresAt <= new Date()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: null,
          verificationTokenExpiresAt: null,
        },
      });
      return this.buildVerificationPage('expired');
    }

    if (user.isEmailVerified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: null,
          verificationTokenExpiresAt: null,
        },
      });
      return this.buildVerificationPage('used');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      },
    });

    if (this.isMobileUserAgent(userAgent)) {
      return { type: 'redirect' as const, location: 'auxtion://verified' };
    }

    return this.buildVerificationPage('success');
  }

  async refreshTokens(userId: string, email: string, role: string) {
    return this.generateTokens(userId, email, role);
  }

  // Remove async — no await needed, just return a plain object
  logout(userId: string) {
    return { message: 'Logged out successfully', userId };
  }

  private async trySendVerificationByUserId(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, isEmailVerified: true },
      });

      if (!user || user.isEmailVerified) return false;

      await this.issueVerificationEmail(user.id, user.email);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Registration succeeded, but verification email failed for user ${userId}: ${message}`,
      );
      return false;
    }
  }

  private logVerificationLink(email: string, verificationLink: string) {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    if (nodeEnv === 'production') return;

    this.logger.log(
      `Email verification link for ${email}: ${verificationLink}`,
    );
  }

  private generateVerificationToken() {
    return randomBytes(32).toString('base64url');
  }

  private hashVerificationToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async enforceResendRateLimit(subject: string) {
    const key = `auth:verification-resend:${subject}`;
    const client = this.redis.getClient();
    const attempts = await client.incr(key);

    if (attempts === 1) {
      await client.expire(key, this.resendWindowSeconds);
    }

    if (attempts > this.resendLimit) {
      throw new HttpException(
        'Please wait a few minutes before requesting another verification email.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private isMobileUserAgent(userAgent: string | undefined) {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent ?? '');
  }

  private buildVerificationPage(
    status: 'success' | 'expired' | 'used' | 'invalid',
  ) {
    const content = {
      success: {
        title: 'Email verified',
        message:
          'Your email has been verified. Open the Auxtion app on your phone to continue.',
        tone: '#10B981',
      },
      expired: {
        title: 'Verification link expired',
        message:
          'This link is no longer active. Open the Auxtion app and request a new verification email.',
        tone: '#F59E0B',
      },
      used: {
        title: 'Verification link already used',
        message:
          'This link has already been used. You can open the Auxtion app and continue.',
        tone: '#1A56DB',
      },
      invalid: {
        title: 'Invalid verification link',
        message:
          'This verification link is invalid. Open the Auxtion app and request a new email.',
        tone: '#EF4444',
      },
    }[status];

    const statusCode = status === 'success' || status === 'used' ? 200 : 400;

    return {
      type: 'html' as const,
      statusCode,
      html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${content.title} | Auxtion</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Arial, sans-serif; background: #1E2A3A; color: #F9FAFB; }
      main { width: min(92vw, 520px); padding: 40px 28px; text-align: center; }
      .mark { width: 64px; height: 64px; margin: 0 auto 24px; border-radius: 999px; display: grid; place-items: center; background: ${content.tone}; color: white; font-size: 32px; font-weight: 700; }
      h1 { margin: 0 0 12px; font-size: 32px; }
      p { margin: 0; color: #CBD5E1; font-size: 16px; line-height: 1.6; }
      .brand { margin-top: 28px; color: #60A5FA; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">${status === 'success' ? 'OK' : '!'}</div>
      <h1>${content.title}</h1>
      <p>${content.message}</p>
      <div class="brand">Auxtion Philippines</div>
    </main>
  </body>
</html>`,
    };
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const jwtSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    const jwtExpiresIn =
      this.configService.getOrThrow<string>('JWT_EXPIRES_IN');
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    const refreshExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtSecret,
        expiresIn: jwtExpiresIn as never,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as never,
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
