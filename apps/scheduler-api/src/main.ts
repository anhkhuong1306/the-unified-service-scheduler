import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  GlobalExceptionFilter,
  LoggingInterceptor,
  ResponseEnvelopeInterceptor,
} from '@app/common';
import { SchedulerApiModule } from './scheduler-api.module';

const DEFAULT_API_PORT = 3000;
const SWAGGER_DOCS_PATH = 'docs/api';

async function bootstrap(): Promise<void> {
  const logger = new Logger('SchedulerApiBootstrap');

  try {
    const app = await NestFactory.create(SchedulerApiModule);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    app.useGlobalInterceptors(
      new LoggingInterceptor(),
      new ResponseEnvelopeInterceptor(),
    );

    app.useGlobalFilters(new GlobalExceptionFilter());

    const swaggerConfig = new DocumentBuilder()
      .setTitle('The Unified Service Scheduler API (Scenario A)')
      .setDescription(
        'DMS-aligned Workshop Service Appointment Scheduler — NestJS Monorepo & PostgreSQL 18',
      )
      .setVersion('4.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(SWAGGER_DOCS_PATH, app, document);

    const rawPort = Number(process.env.APP_PORT ?? DEFAULT_API_PORT);
    const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : DEFAULT_API_PORT;

    await app.listen(port);
    logger.log(
      `scheduler-api listening on port ${port} (Swagger UI: /${SWAGGER_DOCS_PATH})`,
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown bootstrap failure';
    logger.error(`Failed to bootstrap scheduler-api: ${message}`);
    process.exit(1);
  }
}

void bootstrap();
