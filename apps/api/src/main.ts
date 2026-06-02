import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Auxtion API running on http://localhost:${port}/api/v1`);
}

void bootstrap();
