import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createChargeSchema, saveContainerSchema, saveJobSchema, type CreateCharge, type SaveContainer, type SaveJob } from "@transwave/contracts";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
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

  @Post()
  @ApiOperation({ summary: "Create a job with its route and unique services" })
  create(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(saveJobSchema)) input: SaveJob) {
    return this.jobs.create(request.database, request.auth.userId, input);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a job with job-level containers, services and charges" })
  findOne(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.jobs.findOne(request.database, id);
  }

  @Post(":id/similar")
  @ApiOperation({ summary: "Create a draft job by copying shipment details, services and charges without containers" })
  createSimilar(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.jobs.createSimilar(request.database, request.auth.userId, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update all editable job and route details" })
  update(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(saveJobSchema)) input: SaveJob) {
    return this.jobs.update(request.database, request.auth.userId, id, input);
  }

  @Post(":id/containers")
  addContainer(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(saveContainerSchema)) input: SaveContainer) {
    return this.jobs.addContainer(request.database, request.auth.userId, id, input);
  }

  @Delete(":id/containers/:containerId")
  removeContainer(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Param("containerId", ParseUUIDPipe) containerId: string) {
    return this.jobs.removeContainer(request.database, request.auth.userId, id, containerId);
  }

  @Post(":id/charges")
  saveCharge(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(createChargeSchema)) input: CreateCharge) {
    return this.jobs.saveCharge(request.database, request.auth.userId, id, input);
  }

  @Delete(":id/charges/:chargeId")
  removeCharge(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Param("chargeId", ParseUUIDPipe) chargeId: string) {
    return this.jobs.removeCharge(request.database, request.auth.userId, id, chargeId);
  }
}
