import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import type { Environment } from "./config/environment.js";

async function bootstrap() {
  const bodyLimit = Number(process.env.API_BODY_LIMIT_BYTES ?? 262144);
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ bodyLimit }));
  const config = app.get<ConfigService<Environment, true>>(ConfigService);
  const isProduction = config.get("NODE_ENV", { infer: true }) === "production";

  await app.register(helmet, {
    contentSecurityPolicy: isProduction
      ? { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }
      : false,
    hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" }
  });
  await app.register(rateLimit, {
    global: true,
    max: config.get("API_RATE_LIMIT_MAX", { infer: true }),
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({ statusCode: 429, error: "Too Many Requests", message: "Too many requests. Please try again shortly." })
  });

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: config.get("WEB_ORIGIN", { infer: true }),
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"]
  });
  app.getHttpAdapter().getInstance().addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Pragma", "no-cache");
  });
  app.enableShutdownHooks();
  const docsEnabled = config.get("API_DOCS_ENABLED", { infer: true }) === "true" || !isProduction;
  if (docsEnabled) {
    const openApi = new DocumentBuilder()
      .setTitle("TransWave API")
      .setDescription("Authenticated logistics job and invoice operations")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, openApi));
  }

  await app.listen(config.get("PORT", { infer: true }), "0.0.0.0");
}

void bootstrap();
