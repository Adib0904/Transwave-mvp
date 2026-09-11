import { Controller, Get, Inject, Param, ParseUUIDPipe, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { JobsService } from "./jobs.service.js";

@ApiTags("jobs")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("jobs")
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Get()
  @ApiOperation({ summary: "List jobs visible to the signed-in company member" })
  list(@Req() request: AuthenticatedRequest) {
    return this.jobs.list(request.database);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a job with job-level containers, services and charges" })
  findOne(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.jobs.findOne(request.database, id);
  }
}
