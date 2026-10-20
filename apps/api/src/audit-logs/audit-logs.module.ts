import { Module } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import { AuditLogsController } from "./audit-logs.controller.js";
import { AuditLogsService } from "./audit-logs.service.js";

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, SupabaseAuthGuard],
})
export class AuditLogsModule {}
