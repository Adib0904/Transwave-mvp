import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(10000).default(120),
  API_BODY_LIMIT_BYTES: z.coerce.number().int().min(16384).max(10485760).default(262144),
  API_DOCS_ENABLED: z.enum(["true", "false"]).optional(),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1)
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(values: Record<string, unknown>): Environment {
  return environmentSchema.parse(values);
}
