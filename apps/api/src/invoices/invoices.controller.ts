import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createDraftSchema, invoiceProfitInputSchema, markInvoicePaidSchema, updateInvoiceSchema, type CreateDraft, type InvoiceProfitInput, type MarkInvoicePaid, type UpdateInvoice } from "@transwave/contracts";
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

  @Get("page")
  @ApiOperation({ summary: "Get one page of visible invoices" })
  listPage(@Req() request: AuthenticatedRequest, @Query("offset") offset?: string, @Query("limit") limit?: string, @Query("vendorInvoice") vendorInvoice?: string) {
    return this.invoices.listPage(request.database, request.auth.userId, Number(offset ?? 0), Number(limit ?? 20), vendorInvoice ?? "all");
  }

  @Get("commission-report")
  @ApiOperation({ summary: "Get internal agent commission and company profit report" })
  commissionReport(@Req() request: AuthenticatedRequest, @Query("fromDate") fromDate?: string, @Query("toDate") toDate?: string, @Query("agent") agent?: string, @Query("dateBasis") dateBasis?: string) {
    return this.invoices.commissionReport(request.database, request.auth.userId, fromDate, toDate, agent, dateBasis);
  }

  @Get("agents")
  @ApiOperation({ summary: "List previously used invoice agents for selection" })
  agents(@Req() request: AuthenticatedRequest) {
    return this.invoices.listAgents(request.database, request.auth.userId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get an invoice and its lines" })
  findOne(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.invoices.findOne(request.database, id);
  }

  @Patch(":id/profit")
  @ApiOperation({ summary: "Save internal invoice buying cost and agent commission snapshots" })
  saveProfitDetails(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(invoiceProfitInputSchema)) input: InvoiceProfitInput) {
    return this.invoices.saveProfitDetails(request.database, request.auth.userId, id, input);
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

  @Patch(":id/payment")
  @ApiOperation({ summary: "Mark an issued invoice as paid" })
  markPaid(
    @Req() request: AuthenticatedRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(markInvoicePaidSchema)) input: MarkInvoicePaid
  ) {
    return this.invoices.markPaid(request.database, request.auth.userId, id, input.paymentDate);
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
