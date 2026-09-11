import { Module } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import { InvoicesController } from "./invoices.controller.js";
import { InvoicesService } from "./invoices.service.js";

@Module({ controllers: [InvoicesController], providers: [InvoicesService, SupabaseAuthGuard] })
export class InvoicesModule {}
