import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createManagedUserSchema, updateManagedUserSchema, type CreateManagedUser, type UpdateManagedUser } from "@transwave/contracts";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { UsersService } from "./users.service.js";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("users")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}
  @Get() @ApiOperation({ summary: "List users in the signed-in company" }) list(@Req() request: AuthenticatedRequest) { return this.users.list(request.database, request.auth.userId); }
  @Post() @ApiOperation({ summary: "Create a confirmed account with a temporary password" }) create(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(createManagedUserSchema)) input: CreateManagedUser) { return this.users.create(request.database, request.auth.userId, input); }
  @Patch(":id") @ApiOperation({ summary: "Change a user's name, role or active access" }) update(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateManagedUserSchema)) input: UpdateManagedUser) { return this.users.update(request.database, request.auth.userId, id, input); }
}
