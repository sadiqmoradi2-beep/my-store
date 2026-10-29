import { resolve } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { apiDocsEnabled } from './config/security';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CSP is left off: this is a JSON API plus the Swagger docs page, which needs inline
  // scripts/styles that a locked-down CSP would break. Every other header helmet sets
  // (nosniff, frameguard, HSTS, etc.) stays on.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.useStaticAssets(resolve(process.cwd(), 'storage', 'uploads'), { prefix: '/uploads' });
  // Behind a hosting proxy: trust only the configured number of proxy hops (default 1), never every hop —
  // `true` makes Express believe a client-supplied X-Forwarded-For, which defeats IP rate limits.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  app.set('trust proxy', Number.isInteger(proxyHops) && proxyHops >= 0 ? proxyHops : 1);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // API docs (UI at /api/docs and the raw spec at /api/docs-json) are for development only: in production they
  // would hand anyone a map of every endpoint. ENABLE_API_DOCS=true turns them on deliberately.
  const docsEnabled = apiDocsEnabled(process.env);
  if (docsEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('MY STORE API')
      .setDescription('MY STORE — Sales Management Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`MY STORE API → http://localhost:${port}/api/v1${docsEnabled ? ' (docs: /api/docs)' : ''}`);
}

bootstrap();
