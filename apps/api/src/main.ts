import { resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CSP is left off: this is a JSON API plus the Swagger docs page, which needs inline
  // scripts/styles that a locked-down CSP would break. Every other header helmet sets
  // (nosniff, frameguard, HSTS, etc.) stays on.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.useStaticAssets(resolve(process.cwd(), 'storage', 'uploads'), { prefix: '/uploads' });
  // Behind a hosting proxy (Render/Vercel): use the real client IP for rate limiting
  app.set('trust proxy', true);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MY STORE API')
    .setDescription('MY STORE — Sales Management Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`MY STORE API → http://localhost:${port}/api/v1 (docs: /api/docs)`);
}

bootstrap();
