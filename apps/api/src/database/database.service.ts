import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createUserDatabaseClient, type TransWaveDatabaseClient } from "@transwave/database";
import type { Environment } from "../config/environment.js";

@Injectable()
export class DatabaseService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Environment, true>) {}

  forUser(accessToken: string): TransWaveDatabaseClient {
    return createUserDatabaseClient(
      this.config.get("SUPABASE_URL", { infer: true }),
      this.config.get("SUPABASE_PUBLISHABLE_KEY", { infer: true }),
      accessToken
    );
  }
}
