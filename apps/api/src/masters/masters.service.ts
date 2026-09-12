import { Injectable, NotFoundException } from "@nestjs/common";
import type { Customer, MasterData, Port, SaveCustomer, SavePort, SaveService } from "@transwave/contracts";
import type { Database, TransWaveDatabaseClient } from "@transwave/database";
import { requireData, throwDatabaseError } from "../common/database-error.js";
import { decimal } from "../common/format.js";
import { resolveTenant } from "../common/tenant.js";

type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type PortRow = Database["public"]["Tables"]["ports"]["Row"];
type ServiceRow = Database["public"]["Tables"]["services"]["Row"];
const mapCustomer = (row: CustomerRow): Customer => ({ id: row.id, code: row.customer_code, name: row.company_name, trn: row.trn, email: row.email, phone: row.phone, billingAddress: row.billing_address, defaultCurrency: row.default_currency, paymentTermsDays: row.payment_terms_days, active: row.active });
const mapPort = (row: PortRow, companyId: string): Port => ({ id: row.id, unLocode: row.un_locode?.trim() || null, name: row.name, countryCode: row.country_code.trim(), active: row.active, editable: row.company_id === companyId });
const mapService = (row: ServiceRow) => ({ id: row.id, code: row.code, name: row.name, defaultUom: row.default_uom, defaultCurrency: row.default_currency, defaultTaxRateId: row.default_tax_rate_id, active: row.active });

@Injectable()
export class MastersService {
  async list(database: TransWaveDatabaseClient, userId: string): Promise<MasterData> {
    const tenant = await resolveTenant(database, userId);
    const [customers, ports, services, taxRates, branches, currencies] = await Promise.all([
      database.from("customers").select("*").order("company_name"),
      database.from("ports").select("*").order("name"),
      database.from("services").select("*").order("name"),
      database.from("tax_rates").select("id, code, rate").order("rate"),
      database.from("branches").select("id, code, name, active").order("code"),
      database.from("currencies").select("code").order("code")
    ]);
    for (const result of [customers, ports, services, taxRates, branches, currencies]) if (result.error) throwDatabaseError(result.error);
    return {
      customers: (customers.data ?? []).map(mapCustomer),
      ports: (ports.data ?? []).map(row => mapPort(row, tenant.companyId)),
      services: (services.data ?? []).map(mapService),
      taxRates: (taxRates.data ?? []).map(row => ({ id: row.id, code: row.code, rate: decimal(row.rate) })),
      branches: branches.data ?? [],
      currencies: (currencies.data ?? []).map(row => row.code.trim())
    };
  }

  async createCustomer(database: TransWaveDatabaseClient, userId: string, input: SaveCustomer) {
    const tenant = await resolveTenant(database, userId);
    const result = await database.from("customers").insert({ company_id: tenant.companyId, customer_code: input.code, company_name: input.name, trn: input.trn, email: input.email, phone: input.phone, billing_address: input.billingAddress, default_currency: input.defaultCurrency, payment_terms_days: input.paymentTermsDays, active: input.active }).select("*").single();
    return mapCustomer(requireData(result.data, result.error, "Customer was not created"));
  }

  async updateCustomer(database: TransWaveDatabaseClient, userId: string, id: string, input: Partial<SaveCustomer>) {
    const tenant = await resolveTenant(database, userId);
    const values: Database["public"]["Tables"]["customers"]["Update"] = {};
    if (input.code !== undefined) values.customer_code = input.code;
    if (input.name !== undefined) values.company_name = input.name;
    if (input.trn !== undefined) values.trn = input.trn;
    if (input.email !== undefined) values.email = input.email;
    if (input.phone !== undefined) values.phone = input.phone;
    if (input.billingAddress !== undefined) values.billing_address = input.billingAddress;
    if (input.defaultCurrency !== undefined) values.default_currency = input.defaultCurrency;
    if (input.paymentTermsDays !== undefined) values.payment_terms_days = input.paymentTermsDays;
    if (input.active !== undefined) values.active = input.active;
    const result = await database.from("customers").update(values).eq("id", id).eq("company_id", tenant.companyId).select("*").maybeSingle();
    return mapCustomer(requireData(result.data, result.error, "Customer not found"));
  }

  async createPort(database: TransWaveDatabaseClient, userId: string, input: SavePort) {
    const tenant = await resolveTenant(database, userId);
    const result = await database.from("ports").insert({ company_id: tenant.companyId, un_locode: input.unLocode, name: input.name, country_code: input.countryCode, active: input.active }).select("*").single();
    return mapPort(requireData(result.data, result.error, "Port was not created"), tenant.companyId);
  }

  async updatePort(database: TransWaveDatabaseClient, userId: string, id: string, input: Partial<SavePort>) {
    const tenant = await resolveTenant(database, userId);
    const values: Database["public"]["Tables"]["ports"]["Update"] = {};
    if (input.unLocode !== undefined) values.un_locode = input.unLocode;
    if (input.name !== undefined) values.name = input.name;
    if (input.countryCode !== undefined) values.country_code = input.countryCode;
    if (input.active !== undefined) values.active = input.active;
    const result = await database.from("ports").update(values).eq("id", id).eq("company_id", tenant.companyId).select("*").maybeSingle();
    if (!result.data && !result.error) throw new NotFoundException("Only company-created ports can be edited");
    return mapPort(requireData(result.data, result.error, "Port not found"), tenant.companyId);
  }

  async createService(database: TransWaveDatabaseClient, userId: string, input: SaveService) {
    const tenant = await resolveTenant(database, userId);
    const result = await database.from("services").insert({ company_id: tenant.companyId, code: input.code, name: input.name, default_uom: input.defaultUom, default_currency: input.defaultCurrency, default_tax_rate_id: input.defaultTaxRateId, active: input.active }).select("*").single();
    return mapService(requireData(result.data, result.error, "Service was not created"));
  }

  async updateService(database: TransWaveDatabaseClient, userId: string, id: string, input: Partial<SaveService>) {
    const tenant = await resolveTenant(database, userId);
    const values: Database["public"]["Tables"]["services"]["Update"] = {};
    if (input.code !== undefined) values.code = input.code;
    if (input.name !== undefined) values.name = input.name;
    if (input.defaultUom !== undefined) values.default_uom = input.defaultUom;
    if (input.defaultCurrency !== undefined) values.default_currency = input.defaultCurrency;
    if (input.defaultTaxRateId !== undefined) values.default_tax_rate_id = input.defaultTaxRateId;
    if (input.active !== undefined) values.active = input.active;
    const result = await database.from("services").update(values).eq("id", id).eq("company_id", tenant.companyId).select("*").maybeSingle();
    return mapService(requireData(result.data, result.error, "Service not found"));
  }
}
