import { Injectable } from "@nestjs/common";
import type {
  Charge,
  CreateCharge,
  JobDetail,
  JobSummary,
  SaveContainer,
  SaveJob,
} from "@transwave/contracts";
import type { Database, TransWaveDatabaseClient } from "@transwave/database";
import { requireData, throwDatabaseError } from "../common/database-error.js";
import { decimal, money } from "../common/format.js";
import { requireTenantRole } from "../common/tenant.js";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type CreateJobArgs =
  Database["public"]["Functions"]["create_job_with_details"]["Args"];
type UpdateJobArgs =
  Database["public"]["Functions"]["update_job_with_details"]["Args"];

export function isFullyIssuedJob(
  jobId: string,
  charges: Array<{ id: string; job_id: string }>,
  invoiceLines: Array<{ job_charge_id: string; invoice_id: string }>,
  invoices: Array<{ id: string; status: string }>,
): boolean {
  const jobCharges = charges.filter((charge) => charge.job_id === jobId);
  if (!jobCharges.length) return false;

  const issuedInvoiceIds = new Set(
    invoices
      .filter((invoice) => invoice.status === "ISSUED")
      .map((invoice) => invoice.id),
  );
  return jobCharges.every((charge) =>
    invoiceLines.some(
      (line) =>
        line.job_charge_id === charge.id &&
        issuedInvoiceIds.has(line.invoice_id),
    ),
  );
}

@Injectable()
export class JobsService {
  async create(
    database: TransWaveDatabaseClient,
    userId: string,
    input: SaveJob,
  ): Promise<JobDetail> {
    const tenant = await requireTenantRole(database, userId, [
      "OWNER",
      "ADMIN",
      "OPERATIONS",
    ]);
    const { data, error } = await database.rpc("create_job_with_details", {
      ...this.rpcInput(input),
      p_company_id: tenant.companyId,
    });
    if (error) throwDatabaseError(error);
    return this.findOne(
      database,
      requireData(data, null, "Job was not created"),
    );
  }

  async update(
    database: TransWaveDatabaseClient,
    userId: string,
    id: string,
    input: SaveJob,
  ): Promise<JobDetail> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS"]);
    const { data, error } = await database.rpc("update_job_with_details", {
      ...this.updateRpcInput(input),
      p_job_id: id,
    });
    if (error) throwDatabaseError(error);
    return this.findOne(
      database,
      requireData(data, null, "Job was not updated"),
    );
  }

  async createSimilar(
    database: TransWaveDatabaseClient,
    userId: string,
    sourceJobId: string,
  ): Promise<JobDetail> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS"]);
    const { data, error } = await database.rpc("create_similar_job", {
      p_source_job_id: sourceJobId,
    });
    if (error) throwDatabaseError(error);
    return this.findOne(
      database,
      requireData(data, null, "Similar job was not created"),
    );
  }

  async addContainer(
    database: TransWaveDatabaseClient,
    userId: string,
    jobId: string,
    input: SaveContainer,
  ): Promise<JobDetail> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS"]);
    const jobResult = await database
      .from("jobs")
      .select("company_id")
      .eq("id", jobId)
      .maybeSingle();
    const job = requireData(jobResult.data, jobResult.error, "Job not found");
    const { error } = await database
      .from("containers")
      .insert({
        company_id: job.company_id,
        job_id: jobId,
        container_number: input.containerNumber,
        size: Number(input.size),
        container_type: input.containerType,
        seal_number: input.sealNumber,
      });
    if (error) throwDatabaseError(error);
    return this.findOne(database, jobId);
  }

  async removeContainer(
    database: TransWaveDatabaseClient,
    userId: string,
    jobId: string,
    containerId: string,
  ): Promise<JobDetail> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS"]);
    const { error } = await database
      .from("containers")
      .delete()
      .eq("id", containerId)
      .eq("job_id", jobId);
    if (error) throwDatabaseError(error);
    return this.findOne(database, jobId);
  }

  async saveCharge(
    database: TransWaveDatabaseClient,
    userId: string,
    jobId: string,
    input: CreateCharge,
  ): Promise<JobDetail> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const { error } = await database.rpc("save_job_charge", {
      p_job_id: jobId,
      p_job_service_id: input.jobServiceId,
      p_description: input.description,
      p_quantity: Number(input.quantity),
      p_uom: input.uom,
      p_currency_code: input.currency,
      p_exchange_rate: Number(input.exchangeRate),
      p_unit_rate: Number(input.unitRate),
      p_tax_rate_id: input.taxRateId,
    });
    if (error) throwDatabaseError(error);
    return this.findOne(database, jobId);
  }

  async removeCharge(
    database: TransWaveDatabaseClient,
    userId: string,
    jobId: string,
    chargeId: string,
  ): Promise<JobDetail> {
    await requireTenantRole(database, userId, ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"]);
    const { error } = await database
      .from("job_charges")
      .delete()
      .eq("id", chargeId)
      .eq("job_id", jobId);
    if (error) throwDatabaseError(error);
    return this.findOne(database, jobId);
  }

  async list(database: TransWaveDatabaseClient): Promise<JobSummary[]> {
    const { data: jobs, error } = await database
      .from("jobs")
      .select("*")
      .order("opened_at", { ascending: false });
    if (error) throwDatabaseError(error);
    if (!jobs?.length) return [];

    const customerIds = [...new Set(jobs.map((job) => job.customer_id))];
    const jobIds = jobs.map((job) => job.id);
    const [
      { data: customers, error: customersError },
      { data: shipments, error: shipmentsError },
      { data: charges, error: chargesError },
    ] = await Promise.all([
      database
        .from("customers")
        .select("id, company_name")
        .in("id", customerIds),
      database
        .from("shipments")
        .select(
          "job_id, port_of_loading_id, port_of_discharge_id, transshipment_port_id",
        )
        .in("job_id", jobIds),
      database.from("job_charges").select("id, job_id").in("job_id", jobIds),
    ]);
    if (customersError) throwDatabaseError(customersError);
    if (shipmentsError) throwDatabaseError(shipmentsError);
    if (chargesError) throwDatabaseError(chargesError);

    const chargeIds = (charges ?? []).map((charge) => charge.id);
    const invoiceLinesResult = chargeIds.length
      ? await database
          .from("invoice_lines")
          .select("job_charge_id, invoice_id")
          .in("job_charge_id", chargeIds)
      : { data: [], error: null };
    if (invoiceLinesResult.error) throwDatabaseError(invoiceLinesResult.error);

    const invoiceIds = [
      ...new Set(
        (invoiceLinesResult.data ?? []).map((line) => line.invoice_id),
      ),
    ];
    const invoicesResult = invoiceIds.length
      ? await database
          .from("invoices")
          .select("id, status")
          .in("id", invoiceIds)
      : { data: [], error: null };
    if (invoicesResult.error) throwDatabaseError(invoicesResult.error);

    const activeJobs = jobs.filter(
      (job) =>
        !isFullyIssuedJob(
          job.id,
          charges ?? [],
          invoiceLinesResult.data ?? [],
          invoicesResult.data ?? [],
        ),
    );

    const portIds = [
      ...new Set(
        (shipments ?? [])
          .flatMap((shipment) => [
            shipment.port_of_loading_id,
            shipment.port_of_discharge_id,
            shipment.transshipment_port_id,
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const portsResult = portIds.length
      ? await database.from("ports").select("id, name").in("id", portIds)
      : { data: [], error: null };
    if (portsResult.error) throwDatabaseError(portsResult.error);

    const customersById = new Map(
      (customers ?? []).map((customer) => [customer.id, customer.company_name]),
    );
    const shipmentsByJob = new Map(
      (shipments ?? []).map((shipment) => [shipment.job_id, shipment]),
    );
    const portsById = new Map(
      (portsResult.data ?? []).map((port) => [port.id, port.name]),
    );
    return activeJobs.map((job) =>
      this.toSummary(job, customersById, shipmentsByJob, portsById),
    );
  }

  async findOne(
    database: TransWaveDatabaseClient,
    id: string,
  ): Promise<JobDetail> {
    const jobResult = await database
      .from("jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const job = requireData(jobResult.data, jobResult.error, "Job not found");

    const [
      customerResult,
      shipmentResult,
      containersResult,
      jobServicesResult,
      chargesResult,
    ] = await Promise.all([
      database
        .from("customers")
        .select("id, company_name")
        .eq("id", job.customer_id)
        .single(),
      database.from("shipments").select("*").eq("job_id", id).single(),
      database
        .from("containers")
        .select("*")
        .eq("job_id", id)
        .order("container_number"),
      database
        .from("job_services")
        .select("*")
        .eq("job_id", id)
        .order("created_at"),
      database
        .from("job_charges")
        .select("*")
        .eq("job_id", id)
        .order("created_at"),
    ]);
    const customer = requireData(
      customerResult.data,
      customerResult.error,
      "Customer not found",
    );
    const shipment = requireData(
      shipmentResult.data,
      shipmentResult.error,
      "Shipment not found",
    );
    if (containersResult.error) throwDatabaseError(containersResult.error);
    if (jobServicesResult.error) throwDatabaseError(jobServicesResult.error);
    if (chargesResult.error) throwDatabaseError(chargesResult.error);

    const jobServices = jobServicesResult.data ?? [];
    const charges = chargesResult.data ?? [];
    const serviceIds = jobServices.map((item) => item.service_id);
    const taxIds = [...new Set(charges.map((charge) => charge.tax_rate_id))];
    const chargeIds = charges.map((charge) => charge.id);
    const [portsResult, servicesResult, taxesResult, invoiceLinesResult] =
      await Promise.all([
        database
          .from("ports")
          .select("id, name")
          .in(
            "id",
            [
              shipment.port_of_loading_id,
              shipment.port_of_discharge_id,
              shipment.transshipment_port_id,
            ].filter((portId): portId is string => Boolean(portId)),
          ),
        serviceIds.length
          ? database.from("services").select("*").in("id", serviceIds)
          : Promise.resolve({ data: [], error: null }),
        taxIds.length
          ? database.from("tax_rates").select("id, rate").in("id", taxIds)
          : Promise.resolve({ data: [], error: null }),
        chargeIds.length
          ? database
              .from("invoice_lines")
              .select("job_charge_id, invoice_id")
              .in("job_charge_id", chargeIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
    for (const result of [
      portsResult,
      servicesResult,
      taxesResult,
      invoiceLinesResult,
    ]) {
      if (result.error) throwDatabaseError(result.error);
    }

    const portsById = new Map(
      (portsResult.data ?? []).map((port) => [port.id, port.name]),
    );
    const servicesById = new Map(
      (servicesResult.data ?? []).map((service) => [service.id, service]),
    );
    const jobServiceById = new Map(jobServices.map((item) => [item.id, item]));
    const taxesById = new Map(
      (taxesResult.data ?? []).map((tax) => [tax.id, tax.rate]),
    );
    const invoiceByChargeId = new Map(
      (invoiceLinesResult.data ?? []).map((line) => [
        line.job_charge_id,
        line.invoice_id,
      ]),
    );
    const allocatedInvoiceIds = [
      ...new Set(
        (invoiceLinesResult.data ?? []).map((line) => line.invoice_id),
      ),
    ];
    const invoiceStatusesResult = allocatedInvoiceIds.length
      ? await database
          .from("invoices")
          .select("id, status")
          .in("id", allocatedInvoiceIds)
      : { data: [], error: null };
    if (invoiceStatusesResult.error)
      throwDatabaseError(invoiceStatusesResult.error);
    const invoiceStatusById = new Map(
      (invoiceStatusesResult.data ?? []).map((invoice) => [
        invoice.id,
        invoice.status,
      ]),
    );
    const mappedCharges: Charge[] = charges.map((charge) => {
      const serviceId = jobServiceById.get(charge.job_service_id)?.service_id;
      const service = serviceId ? servicesById.get(serviceId) : undefined;
      const taxRate = taxesById.get(charge.tax_rate_id) ?? 0;
      const net = Number(charge.net_amount_aed ?? 0);
      const vat = Math.round(net * Number(taxRate)) / 100;
      const invoiceId = invoiceByChargeId.get(charge.id) ?? null;
      return {
        id: charge.id,
        jobServiceId: charge.job_service_id,
        serviceId: serviceId ?? "",
        serviceName: service?.name ?? "Unknown service",
        description: charge.description,
        quantity: decimal(charge.quantity),
        uom: charge.uom,
        currency: charge.currency_code,
        exchangeRate: decimal(charge.exchange_rate),
        unitRate: money(charge.unit_rate),
        taxRate: decimal(taxRate),
        netAmount: money(net),
        vatAmount: money(vat),
        totalAmount: money(net + vat),
        invoiceId,
        invoiceStatus: invoiceId
          ? (invoiceStatusById.get(invoiceId) ?? null)
          : null,
      };
    });

    return {
      ...this.toSummary(
        job,
        new Map([[customer.id, customer.company_name]]),
        new Map([[shipment.job_id, shipment]]),
        portsById,
      ),
      customerId: customer.id,
      branchId: job.branch_id,
      polId: shipment.port_of_loading_id,
      podId: shipment.port_of_discharge_id,
      transshipmentPortId: shipment.transshipment_port_id,
      vessel: shipment.vessel,
      voyage: shipment.voyage,
      sailedDate: shipment.sailed_at,
      originPort: shipment.origin_port,
      placeOfDelivery: shipment.place_of_delivery,
      shipper: shipment.shipper,
      consignee: shipment.consignee,
      notifyName: shipment.notify_name,
      commodity: shipment.commodity,
      salesPerson: shipment.sales_person,
      customerReference: shipment.customer_reference,
      packageCount: shipment.package_count,
      weightKg: shipment.weight_kg === null ? null : Number(shipment.weight_kg),
      volumeCbm:
        shipment.volume_cbm === null ? null : Number(shipment.volume_cbm),
      chargeableWeightKg:
        shipment.chargeable_weight_kg === null
          ? null
          : Number(shipment.chargeable_weight_kg),
      customsDocReference: shipment.customs_doc_reference,
      shipmentTerms: shipment.shipment_terms,
      hbl: shipment.hbl,
      mbl: shipment.mbl,
      services: jobServices.flatMap((item) => {
        const service = servicesById.get(item.service_id);
        return service
          ? [
              {
                id: service.id,
                jobServiceId: item.id,
                code: service.code,
                name: service.name,
                defaultUom: service.default_uom,
                active: service.active,
              },
            ]
          : [];
      }),
      containers: (containersResult.data ?? []).map((container) => ({
        id: container.id,
        containerNumber: container.container_number,
        size: String(container.size) as "20" | "40" | "45",
        containerType: container.container_type,
        sealNumber: container.seal_number,
      })),
      charges: mappedCharges,
    };
  }

  private toSummary(
    job: JobRow,
    customersById: Map<string, string>,
    shipmentsByJob: Map<
      string,
      {
        port_of_loading_id: string;
        port_of_discharge_id: string;
        transshipment_port_id: string | null;
      }
    >,
    portsById: Map<string, string>,
  ): JobSummary {
    const shipment = shipmentsByJob.get(job.id);
    return {
      id: job.id,
      jobNumber: job.job_number,
      customerName: customersById.get(job.customer_id) ?? "Unknown customer",
      polName: shipment
        ? (portsById.get(shipment.port_of_loading_id) ?? "Unknown port")
        : "Not set",
      podName: shipment
        ? (portsById.get(shipment.port_of_discharge_id) ?? "Unknown port")
        : "Not set",
      transshipmentPortName: shipment?.transshipment_port_id
        ? (portsById.get(shipment.transshipment_port_id) ?? "Unknown port")
        : null,
      transportMode: job.transport_mode,
      status: job.status,
      plannedContainerType: job.planned_container_type,
      plannedContainerCount: job.planned_container_count,
    };
  }

  private rpcInput(input: SaveJob): Omit<CreateJobArgs, "p_company_id"> {
    return {
      p_branch_id: input.branchId,
      p_customer_id: input.customerId,
      p_status: input.status,
      p_transport_mode: input.transportMode,
      p_planned_container_type: input.plannedContainerType,
      p_planned_container_count: input.plannedContainerCount,
      p_pol_id: input.polId,
      p_pod_id: input.podId,
      p_transshipment_port_id: input.transshipmentPortId,
      p_vessel: input.vessel,
      p_voyage: input.voyage,
      p_sailed_at: input.sailedDate,
      p_origin_port: input.originPort,
      p_place_of_delivery: input.placeOfDelivery,
      p_shipper: input.shipper,
      p_consignee: input.consignee,
      p_notify_name: input.notifyName,
      p_commodity: input.commodity,
      p_sales_person: input.salesPerson,
      p_customer_reference: input.customerReference,
      p_package_count: input.packageCount,
      p_hbl: input.hbl,
      p_mbl: input.mbl,
      p_weight_kg: input.weightKg,
      p_volume_cbm: input.volumeCbm,
      p_chargeable_weight_kg: input.chargeableWeightKg,
      p_customs_doc_reference: input.customsDocReference,
      p_shipment_terms: input.shipmentTerms,
      p_container_numbers: input.containerNumbers,
      p_service_ids: input.serviceIds,
    } as unknown as Omit<CreateJobArgs, "p_company_id">;
  }

  private updateRpcInput(input: SaveJob): Omit<UpdateJobArgs, "p_job_id"> {
    const values: Partial<Omit<CreateJobArgs, "p_company_id">> = {
      ...this.rpcInput(input),
    };
    delete values.p_container_numbers;
    return values as Omit<UpdateJobArgs, "p_job_id">;
  }
}
