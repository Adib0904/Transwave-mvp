import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { User } from "@supabase/supabase-js";
import type { CreateManagedUser, ManagedUser, UpdateManagedUser } from "@transwave/contracts";
import { z } from "zod";
import { DatabaseService } from "../database/database.service.js";
import type { TransWaveDatabaseClient } from "@transwave/database";
import { throwDatabaseError } from "../common/database-error.js";
import { resolveTenant } from "../common/tenant.js";

const metadataSchema = z.object({ name: z.string().optional() }).passthrough();

@Injectable()
export class UsersService {
  constructor(@Inject(DatabaseService) private readonly databases: DatabaseService) {}

  async list(database: TransWaveDatabaseClient, actorId: string): Promise<ManagedUser[]> {
    const tenant = await this.requireAdministrator(database, actorId);
    const system = this.databases.system();
    const memberships = await system.from("company_members").select("user_id, role, active, created_at").eq("company_id", tenant.companyId).order("created_at");
    if (memberships.error) throwDatabaseError(memberships.error);
    const authUsers = await system.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authUsers.error) throw new BadRequestException(authUsers.error.message);
    const byId = new Map(authUsers.data.users.map(user => [user.id, user]));
    return (memberships.data ?? []).flatMap(membership => {
      const user = byId.get(membership.user_id);
      return user ? [this.mapUser(user, membership.role, membership.active, membership.created_at)] : [];
    });
  }

  async create(database: TransWaveDatabaseClient, actorId: string, input: CreateManagedUser): Promise<ManagedUser> {
    const tenant = await this.requireAdministrator(database, actorId);
    this.assertOwnerAssignmentAllowed(tenant.role, input.role);
    const system = this.databases.system();
    const created = await system.auth.admin.createUser({ email: input.email, password: input.temporaryPassword, email_confirm: true, user_metadata: { name: input.name } });
    if (created.error || !created.data.user) {
      const isExistingAccount = /already|registered|exists/i.test(created.error?.message ?? "");
      if (isExistingAccount) return this.linkExistingAccount(system, tenant.companyId, actorId, input);
      throw new BadRequestException(created.error?.message ?? "The account was not created");
    }
    const membership = await system.from("company_members").insert({ company_id: tenant.companyId, user_id: created.data.user.id, role: input.role, active: true }).select("created_at").single();
    if (membership.error) {
      await system.auth.admin.deleteUser(created.data.user.id);
      throwDatabaseError(membership.error);
    }
    await system.from("audit_logs").insert({ company_id: tenant.companyId, actor_user_id: actorId, action: "USER_CREATED", entity_type: "user", entity_id: created.data.user.id, details: { email: input.email, role: input.role } });
    return this.mapUser(created.data.user, input.role, true, membership.data.created_at);
  }

  private async linkExistingAccount(
    system: ReturnType<DatabaseService["system"]>,
    companyId: string,
    actorId: string,
    input: CreateManagedUser,
  ): Promise<ManagedUser> {
    const authUsers = await system.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (authUsers.error) throw new BadRequestException(authUsers.error.message);
    const authUser = authUsers.data.users.find(user => user.email?.toLowerCase() === input.email.toLowerCase());
    if (!authUser) throw new ConflictException("An account with this email already exists but could not be linked");

    const memberships = await system.from("company_members").select("company_id, active, created_at").eq("user_id", authUser.id);
    if (memberships.error) throwDatabaseError(memberships.error);
    const currentMembership = memberships.data?.find(membership => membership.company_id === companyId);
    const otherMembership = memberships.data?.find(membership => membership.company_id !== companyId);
    if (otherMembership) throw new ConflictException("This account already belongs to another company and cannot be linked here");
    if (currentMembership?.active) throw new ConflictException("This user already belongs to this company");

    const authUpdate = await system.auth.admin.updateUserById(authUser.id, { user_metadata: { name: input.name } });
    if (authUpdate.error || !authUpdate.data.user) throw new BadRequestException(authUpdate.error?.message ?? "The account profile was not updated");

    const membership = currentMembership
      ? await system.from("company_members").update({ role: input.role, active: true }).eq("company_id", companyId).eq("user_id", authUser.id).select("created_at").single()
      : await system.from("company_members").insert({ company_id: companyId, user_id: authUser.id, role: input.role, active: true }).select("created_at").single();
    if (membership.error) throwDatabaseError(membership.error);

    await system.from("audit_logs").insert({
      company_id: companyId,
      actor_user_id: actorId,
      action: currentMembership ? "USER_REACTIVATED" : "USER_LINKED",
      entity_type: "user",
      entity_id: authUser.id,
      details: { email: input.email, role: input.role },
    });
    return this.mapUser(authUpdate.data.user, input.role, true, membership.data.created_at);
  }

  async update(database: TransWaveDatabaseClient, actorId: string, userId: string, input: UpdateManagedUser): Promise<ManagedUser> {
    const tenant = await this.requireAdministrator(database, actorId);
    const system = this.databases.system();
    const membershipResult = await system.from("company_members").select("role, active, created_at").eq("company_id", tenant.companyId).eq("user_id", userId).maybeSingle();
    if (membershipResult.error) throwDatabaseError(membershipResult.error);
    const current = membershipResult.data;
    if (!current) throw new NotFoundException("User membership not found");
    if (tenant.role !== "OWNER" && (current.role === "OWNER" || input.role === "OWNER")) {
      throw new ForbiddenException("Only an owner can grant or modify owner access");
    }
    if (actorId === userId && input.active === false) throw new BadRequestException("You cannot deactivate your own account");
    const removesOwner = current.role === "OWNER" && (input.role && input.role !== "OWNER" || input.active === false);
    if (removesOwner) {
      const owners = await system.from("company_members").select("user_id", { count: "exact", head: true }).eq("company_id", tenant.companyId).eq("role", "OWNER").eq("active", true);
      if (owners.error) throwDatabaseError(owners.error);
      if ((owners.count ?? 0) <= 1) throw new BadRequestException("The company must retain at least one active owner");
    }
    const membership = await system.from("company_members").update({ role: input.role, active: input.active }).eq("company_id", tenant.companyId).eq("user_id", userId).select("role, active, created_at").single();
    if (membership.error) throwDatabaseError(membership.error);
    if (input.name) {
      const authUpdate = await system.auth.admin.updateUserById(userId, { user_metadata: { name: input.name } });
      if (authUpdate.error) throw new BadRequestException(authUpdate.error.message);
    }
    const authUser = await system.auth.admin.getUserById(userId);
    if (authUser.error || !authUser.data.user) throw new NotFoundException("Authentication account not found");
    await system.from("audit_logs").insert({ company_id: tenant.companyId, actor_user_id: actorId, action: "USER_UPDATED", entity_type: "user", entity_id: userId, details: input });
    return this.mapUser(authUser.data.user, membership.data.role, membership.data.active, membership.data.created_at);
  }

  private async requireAdministrator(database: TransWaveDatabaseClient, actorId: string) {
    const tenant = await resolveTenant(database, actorId);
    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") throw new ForbiddenException("Only owners and administrators can manage users");
    return tenant;
  }

  private assertOwnerAssignmentAllowed(actorRole: ManagedUser["role"], assignedRole: ManagedUser["role"]) {
    if (actorRole !== "OWNER" && assignedRole === "OWNER") {
      throw new ForbiddenException("Only an owner can grant owner access");
    }
  }

  private mapUser(user: User, role: ManagedUser["role"], active: boolean, createdAt: string): ManagedUser {
    const metadata = metadataSchema.safeParse(user.user_metadata);
    return { id: user.id, email: user.email ?? "unknown@transwave.local", name: metadata.success ? metadata.data.name ?? "Unnamed user" : "Unnamed user", role, active, createdAt, lastSignInAt: user.last_sign_in_at ?? null };
  }
}
