import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { attachVendorDocumentSchema, saveVendorBillSchema, type AttachVendorDocument, type SaveVendorBill } from "@transwave/contracts";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import type { AuthenticatedRequest } from "../auth/authenticated-request.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { VendorBillsService } from "./vendor-bills.service.js";

@ApiTags("vendor bills and profit")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("vendor-bills")
export class VendorBillsController {
  constructor(@Inject(VendorBillsService) private readonly bills: VendorBillsService) {}
  @Get() list(@Req() request: AuthenticatedRequest) { return this.bills.list(request.database); }
  @Get("page") listPage(@Req() request: AuthenticatedRequest, @Query("offset") offset?: string, @Query("limit") limit?: string) { return this.bills.listPage(request.database, Number(offset ?? 0), Number(limit ?? 20)); }
  @Get(":id") findOne(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string) { return this.bills.findOne(request.database, id); }
  @Post() create(@Req() request: AuthenticatedRequest, @Body(new ZodValidationPipe(saveVendorBillSchema)) input: SaveVendorBill) { return this.bills.create(request.database, request.auth.userId, input); }
  @Patch(":id") update(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(saveVendorBillSchema)) input: SaveVendorBill) { return this.bills.update(request.database, request.auth.userId, id, input); }
  @Patch(":id/document") attachDocument(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(attachVendorDocumentSchema)) input: AttachVendorDocument) { return this.bills.attachDocument(request.database, request.auth.userId, id, input); }
  @Delete(":id") @HttpCode(204) remove(@Req() request: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string) { return this.bills.remove(request.database, request.auth.userId, id); }
}
