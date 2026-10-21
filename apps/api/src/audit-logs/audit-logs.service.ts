import { Inject, Injectable } from "@nestjs/common";
import type { AuditLogPage } from "@transwave/contracts";
import type { TransWaveDatabaseClient } from "@transwave/database";
import { DatabaseService } from "../database/database.service.js";
import { throwDatabaseError } from "../common/database-error.js";
import { requireTenantRole, resolveTenant } from "../common/tenant.js";

@Injectable()
export class AuditLogsService {
  constructor(@Inject(DatabaseService) private readonly databases: DatabaseService) {}

  async recordAuthEvent(database: TransWaveDatabaseClient, userId: string, email: string, event: "login" | "logout"): Promise<void> {
    const tenant = await resolveTenant(database, userId);
    const system = this.databases.system();
    const result = await system.from("audit_logs").insert({
      company_id: tenant.companyId,
      actor_user_id: userId,
      action: event === "login" ? "USER_LOGGED_IN" : "USER_LOGGED_OUT",
      entity_type: "auth",
      entity_id: userId,
      details: { email, role: tenant.role },
    });
    if (result.error) throwDatabaseError(result.error);
  }

  async list(database: TransWaveDatabaseClient, userId: string, filters: Record<string, string | undefined>): Promise<AuditLogPage> {
    const tenant = await requireTenantRole(database, userId, ["OWNER", "ADMIN"]);
    const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
    const requestedSize = Number.parseInt(filters.pageSize ?? "10", 10) || 10;
    const pageSize = [10, 20, 50, 100].includes(requestedSize) ? requestedSize : 10;
    let query = database
      .from("audit_logs")
      .select("id, actor_user_id, action, entity_type, entity_id, details, created_at", { count: "exact" })
      .eq("company_id", tenant.companyId)
      .order("created_at", { ascending: false });

    if (filters.actorUserId) query = query.eq("actor_user_id", filters.actorUserId);
    if (filters.fromDate) query = query.gte("created_at", filters.fromDate.includes("T") ? filters.fromDate : `${filters.fromDate}T00:00:00.000Z`);
    if (filters.toDate) query = query.lte("created_at", filters.toDate.includes("T") ? filters.toDate : `${filters.toDate}T23:59:59.999Z`);
    if (filters.action === "login") {
      query = query.eq("action", "USER_LOGGED_IN");
    } else if (filters.action === "logout") {
      query = query.eq("action", "USER_LOGGED_OUT");
    } else if (["created", "updated", "deleted"].includes(filters.action ?? "")) {
      query = query.ilike("action", `%_${filters.action!.toUpperCase()}`);
    } else if (filters.action === "other") {
      query = query.not("action", "ilike", "%_CREATED").not("action", "ilike", "%_UPDATED").not("action", "ilike", "%_DELETED").not("action", "ilike", "%_LOGGED_IN").not("action", "ilike", "%_LOGGED_OUT");
    }

    const categoryTypes: Record<string, string[]> = {
      jobs: ["job", "shipments", "job_services", "containers", "job_charges"],
      invoices: ["invoice", "invoice_lines"],
      costs: ["vendor_bill", "vendor_bills", "vendor_bill_lines", "vendors"],
      masters: ["branches", "tax_rates", "services", "ports"],
      auth: ["auth"],
    };
    const category = filters.entityType ? categoryTypes[filters.entityType] : undefined;
    if (category) query = query.in("entity_type", category);
    else if (filters.entityType === "other") {
      query = query.not("entity_type", "in", '("job","shipments","job_services","containers","job_charges","invoice","invoice_lines","vendor_bill","vendor_bills","vendor_bill_lines","vendors","branches","tax_rates","services","ports","auth")');
    } else if (filters.entityType && filters.entityType !== "all") {
      query = query.eq("entity_type", filters.entityType);
    }

    const search = (filters.search ?? "").trim().replace(/[^a-zA-Z0-9 _/-]/g, " ").replace(/\s+/g, " ").slice(0, 80);
    if (search) query = query.or(`action.ilike.%${search}%,entity_type.ilike.%${search}%`);

    const result = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (result.error) throwDatabaseError(result.error);
    return {
      items: (result.data ?? []).map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: row.details as Record<string, unknown>,
      createdAt: row.created_at,
      })),
      total: result.count ?? 0,
      page,
      pageSize,
    };
  }
}
