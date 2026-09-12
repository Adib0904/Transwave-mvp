import { NotFoundException } from "@nestjs/common";
import type { TransWaveDatabaseClient } from "@transwave/database";
import { requireData, throwDatabaseError } from "./database-error.js";

export async function resolveTenant(database: TransWaveDatabaseClient, userId: string) {
  const membershipResult = await database.from("company_members").select("company_id, role").eq("user_id", userId).eq("active", true).limit(1).maybeSingle();
  const membership = requireData(membershipResult.data, membershipResult.error, "No active company membership found");
  const [companyResult, branchResult] = await Promise.all([
    database.from("companies").select("id, legal_name").eq("id", membership.company_id).single(),
    database.from("branches").select("id, code, name, active").eq("company_id", membership.company_id).eq("active", true).order("code").limit(1).maybeSingle()
  ]);
  const company = requireData(companyResult.data, companyResult.error, "Company not found");
  if (branchResult.error) throwDatabaseError(branchResult.error);
  if (!branchResult.data) throw new NotFoundException("No active branch is configured");
  return { companyId: company.id, companyName: company.legal_name, role: membership.role, branch: branchResult.data };
}
