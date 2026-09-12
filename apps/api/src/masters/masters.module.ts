import { Module } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import { MastersController } from "./masters.controller.js";
import { MastersService } from "./masters.service.js";

@Module({ controllers: [MastersController], providers: [MastersService, SupabaseAuthGuard] })
export class MastersModule {}
