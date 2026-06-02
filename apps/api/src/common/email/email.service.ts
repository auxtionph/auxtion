import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly from = 'onboarding@resend.dev';

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(
      this.configService.getOrThrow<string>('RESEND_API_KEY'),
    );
  }

  async sendVerificationEmail(email: string, verificationLink: string) {
    return this.resend.emails.send({
      from: this.from,
      to: email,
      subject: 'Verify your Auxtion account',
      html: `
        <h1>Verify your Auxtion account</h1>
        <p>Thanks for joining Auxtion. Please verify your email address to finish setting up your account.</p>
        <p><a href="${verificationLink}">Verify email</a></p>
        <p>This link expires in 24 hours.</p>
      `,
    });
  }
}
