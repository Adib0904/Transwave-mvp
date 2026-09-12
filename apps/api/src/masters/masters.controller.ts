import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { saveCustomerSchema, savePortSchema, saveServiceSchema, type SaveCustomer, type SavePort, type SaveService } from "@transwave/contracts";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { MastersService } from "./masters.service.js";

@ApiTags("master data")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("masters")
export class MastersController {
  constructor(@Inject(MastersService) private readonly masters: MastersService) {}
  @Get() list(@Req() request: AuthenticatedRequest) { return this.masters.list(request.database, request.auth.userId); }
  @Post("customers") createCustomer(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(saveCustomerSchema)) input: SaveCustomer) { return this.masters.createCustomer(request.database, request.auth.userId, input); }
  @Patch("customers/:id") updateCustomer(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(saveCustomerSchema.partial())) input: Partial<SaveCustomer>) { return this.masters.updateCustomer(request.database, request.auth.userId, id, input); }
  @Post("ports") createPort(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(savePortSchema)) input: SavePort) { return this.masters.createPort(request.database, request.auth.userId, input); }
  @Patch("ports/:id") updatePort(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(savePortSchema.partial())) input: Partial<SavePort>) { return this.masters.updatePort(request.database, request.auth.userId, id, input); }
  @Post("services") createService(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(saveServiceSchema)) input: SaveService) { return this.masters.createService(request.database, request.auth.userId, input); }
  @Patch("services/:id") updateService(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(saveServiceSchema.partial())) input: Partial<SaveService>) { return this.masters.updateService(request.database, request.auth.userId, id, input); }
}
