import { Module } from "@nestjs/common";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({ controllers: [UsersController], providers: [UsersService, SupabaseAuthGuard] })
export class UsersModule {}
