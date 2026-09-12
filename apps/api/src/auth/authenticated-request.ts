import type { FastifyRequest } from "fastify";
import type { TransWaveDatabaseClient } from "@transwave/database";

export interface AuthenticatedRequest extends FastifyRequest {
  auth: {
    accessToken: string;
    userId: string;
    email: string;
  };
  database: TransWaveDatabaseClient;
}
