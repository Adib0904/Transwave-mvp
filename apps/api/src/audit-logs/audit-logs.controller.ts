import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import { AuditLogsService } from "./audit-logs.service.js";

@ApiTags("audit logs")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("audit-logs")
export class AuditLogsController {
  constructor(@Inject(AuditLogsService) private readonly auditLogs: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: "List recent company changes for owners and administrators" })
  list(@Req() request: AuthenticatedRequest, @Query() query: Record<string, string | undefined>) {
    return this.auditLogs.list(request.database, request.auth.userId, query);
  }
}
