import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { DatabaseService } from "../database/database.service.js";
import type { AuthenticatedRequest } from "./authenticated-request.js";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(@Inject(DatabaseService) private readonly databases: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException("A bearer access token is required");

    const accessToken = match[1];
    const database = this.databases.forUser(accessToken);
    const { data, error } = await database.auth.getClaims(accessToken);
    const userId = data?.claims.sub;
    if (error || !userId) throw new UnauthorizedException("The access token is invalid or expired");

    const authenticated = request as AuthenticatedRequest;
    authenticated.auth = { accessToken, userId };
    authenticated.database = database;
    return true;
  }
}
