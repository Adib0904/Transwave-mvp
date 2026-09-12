import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import type { Environment } from "./config/environment.js";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const config = app.get<ConfigService<Environment, true>>(ConfigService);

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: config.get("WEB_ORIGIN", { infer: true }),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });
  app.enableShutdownHooks();
  const openApi = new DocumentBuilder()
    .setTitle("TransWave API")
    .setDescription("Authenticated logistics job and invoice operations")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, openApi));

  await app.listen(config.get("PORT", { infer: true }), "0.0.0.0");
}

void bootstrap();
