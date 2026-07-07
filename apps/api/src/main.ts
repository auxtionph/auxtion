import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Trust the first proxy hop (Railway) so req.ip reflects the real client
  // from X-Forwarded-For. Without this the rate limiter sees only the proxy IP
  // and throttles all users against a single shared bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Raw body preservation for PayMongo webhook signature verification
  // Must be registered BEFORE helmet and body parsers
  app.use(
    '/api/v1/payments/webhook/paymongo',
    (req: any, _res: any, next: any) => {
      let data = '';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      req.setEncoding('utf8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      req.on('data', (chunk: string) => {
        data += chunk;
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      req.on('end', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        req.rawBody = data;
        next();
      });
      // Without an error handler, a client aborting mid-body leaves the request
      // hanging until the proxy timeout (cheap DoS on the webhook route).
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      req.on('error', (err: Error) => next(err));
    },
  );

  app.use(helmet());
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Native mobile requests carry no Origin header (CORS not enforced), so the
  // allowlist only affects browser clients. Set CORS_ORIGINS (comma-separated)
  // in prod to lock the payments API to known web origins; unset stays open for
  // local dev.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Auxtion API running on http://localhost:${port}/api/v1`);
}

void bootstrap();
