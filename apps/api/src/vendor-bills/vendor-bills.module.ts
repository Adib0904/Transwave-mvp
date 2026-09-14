import { Module } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import { VendorBillsController } from "./vendor-bills.controller.js";
import { VendorBillsService } from "./vendor-bills.service.js";

@Module({ controllers: [VendorBillsController], providers: [VendorBillsService, SupabaseAuthGuard] })
export class VendorBillsModule {}
