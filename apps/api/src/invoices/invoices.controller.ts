import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createDraftSchema, updateInvoiceSchema, type CreateDraft, type UpdateInvoice } from "@transwave/contracts";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { InvoicesService } from "./invoices.service.js";

@ApiTags("invoices")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("invoices")
export class InvoicesController {
  constructor(@Inject(InvoicesService) private readonly invoices: InvoicesService) {}

  @Get()
  @ApiOperation({ summary: "List visible draft and issued invoices" })
  list(@Req() request: AuthenticatedRequest) {
    return this.invoices.list(request.database, request.auth.userId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get an invoice and its lines" })
  findOne(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.findOne(request.database, id);
  }

  @Post("drafts")
  @ApiOperation({ summary: "Create a draft by atomically allocating selected unbilled job charges" })
  createDraft(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createDraftSchema)) input: CreateDraft
  ) {
    return this.invoices.createDraft(request.database, request.auth.userId, input.jobId, input.chargeIds);
  }

  @Post(":id/issue")
  @ApiOperation({ summary: "Issue a draft and atomically allocate its permanent invoice number" })
  issue(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.issue(request.database, request.auth.userId, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Revise a draft or issued invoice while preserving its number and audit history" })
  update(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateInvoiceSchema)) input: UpdateInvoice
  ) {
    return this.invoices.update(request.database, request.auth.userId, id, input);
  }
}
