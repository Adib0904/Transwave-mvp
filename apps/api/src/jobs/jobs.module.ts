import { Module } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import { JobsController } from "./jobs.controller.js";
import { JobsService } from "./jobs.service.js";

@Module({ controllers: [JobsController], providers: [JobsService, SupabaseAuthGuard] })
export class JobsModule {}
