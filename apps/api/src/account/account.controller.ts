import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { resolveTenant } from "../common/tenant.js";

@ApiTags("account")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("account")
export class AccountController {
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    const tenant = await resolveTenant(request.database, request.auth.userId);
    return {
      userId: request.auth.userId,
      email: request.auth.email,
      companyId: tenant.companyId,
      companyName: tenant.companyName,
      role: tenant.role,
      branchId: tenant.branch.id,
      branchName: tenant.branch.name
    };
  }
}
