import { Module } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import { AccountController } from "./account.controller.js";

@Module({ controllers: [AccountController], providers: [SupabaseAuthGuard] })
export class AccountModule {}
