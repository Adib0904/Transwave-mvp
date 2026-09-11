import { Injectable } from "@nestjs/common";
import type { Charge, JobDetail, JobSummary } from "@transwave/contracts";
import type { Database, TransWaveDatabaseClient } from "@transwave/database";
import { requireData, throwDatabaseError } from "../common/database-error.js";
import { decimal, money } from "../common/format.js";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

@Injectable()
export class JobsService {
  async list(database: TransWaveDatabaseClient): Promise<JobSummary[]> {
    const { data: jobs, error } = await database.from("jobs").select("*").order("opened_at", { ascending: false });
    if (error) throwDatabaseError(error);
    if (!jobs?.length) return [];

    const customerIds = [...new Set(jobs.map(job => job.customer_id))];
    const jobIds = jobs.map(job => job.id);
    const [{ data: customers, error: customersError }, { data: shipments, error: shipmentsError }] = await Promise.all([
      database.from("customers").select("id, company_name").in("id", customerIds),
      database.from("shipments").select("job_id, port_of_loading_id, port_of_discharge_id, transshipment_port_id").in("job_id", jobIds)
    ]);
    if (customersError) throwDatabaseError(customersError);
    if (shipmentsError) throwDatabaseError(shipmentsError);

    const portIds = [...new Set((shipments ?? []).flatMap(shipment => [shipment.port_of_loading_id, shipment.port_of_discharge_id, shipment.transshipment_port_id]).filter((id): id is string => Boolean(id)))];
    const portsResult = portIds.length
      ? await database.from("ports").select("id, name").in("id", portIds)
      : { data: [], error: null };
    if (portsResult.error) throwDatabaseError(portsResult.error);

    const customersById = new Map((customers ?? []).map(customer => [customer.id, customer.company_name]));
    const shipmentsByJob = new Map((shipments ?? []).map(shipment => [shipment.job_id, shipment]));
    const portsById = new Map((portsResult.data ?? []).map(port => [port.id, port.name]));
    return jobs.map(job => this.toSummary(job, customersById, shipmentsByJob, portsById));
  }

  async findOne(database: TransWaveDatabaseClient, id: string): Promise<JobDetail> {
    const jobResult = await database.from("jobs").select("*").eq("id", id).maybeSingle();
    const job = requireData(jobResult.data, jobResult.error, "Job not found");

    const [customerResult, shipmentResult, containersResult, jobServicesResult, chargesResult] = await Promise.all([
      database.from("customers").select("id, company_name").eq("id", job.customer_id).single(),
      database.from("shipments").select("*").eq("job_id", id).single(),
      database.from("containers").select("*").eq("job_id", id).order("container_number"),
      database.from("job_services").select("*").eq("job_id", id).order("created_at"),
      database.from("job_charges").select("*").eq("job_id", id).order("created_at")
    ]);
    const customer = requireData(customerResult.data, customerResult.error, "Customer not found");
    const shipment = requireData(shipmentResult.data, shipmentResult.error, "Shipment not found");
    if (containersResult.error) throwDatabaseError(containersResult.error);
    if (jobServicesResult.error) throwDatabaseError(jobServicesResult.error);
    if (chargesResult.error) throwDatabaseError(chargesResult.error);

    const jobServices = jobServicesResult.data ?? [];
    const charges = chargesResult.data ?? [];
    const serviceIds = jobServices.map(item => item.service_id);
    const taxIds = [...new Set(charges.map(charge => charge.tax_rate_id))];
    const chargeIds = charges.map(charge => charge.id);
    const [portsResult, servicesResult, taxesResult, invoiceLinesResult] = await Promise.all([
      database.from("ports").select("id, name").in("id", [shipment.port_of_loading_id, shipment.port_of_discharge_id, shipment.transshipment_port_id].filter((portId): portId is string => Boolean(portId))),
      serviceIds.length ? database.from("services").select("*").in("id", serviceIds) : Promise.resolve({ data: [], error: null }),
      taxIds.length ? database.from("tax_rates").select("id, rate").in("id", taxIds) : Promise.resolve({ data: [], error: null }),
      chargeIds.length ? database.from("invoice_lines").select("job_charge_id, invoice_id").in("job_charge_id", chargeIds) : Promise.resolve({ data: [], error: null })
    ]);
    for (const result of [portsResult, servicesResult, taxesResult, invoiceLinesResult]) {
      if (result.error) throwDatabaseError(result.error);
    }

    const portsById = new Map((portsResult.data ?? []).map(port => [port.id, port.name]));
    const servicesById = new Map((servicesResult.data ?? []).map(service => [service.id, service]));
    const jobServiceById = new Map(jobServices.map(item => [item.id, item]));
    const taxesById = new Map((taxesResult.data ?? []).map(tax => [tax.id, tax.rate]));
    const invoiceByChargeId = new Map((invoiceLinesResult.data ?? []).map(line => [line.job_charge_id, line.invoice_id]));
    const mappedCharges: Charge[] = charges.map(charge => {
      const serviceId = jobServiceById.get(charge.job_service_id)?.service_id;
      const service = serviceId ? servicesById.get(serviceId) : undefined;
      const taxRate = taxesById.get(charge.tax_rate_id) ?? 0;
      const net = Number(charge.net_amount_aed ?? 0);
      const vat = Math.round(net * Number(taxRate)) / 100;
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
        invoiceId: invoiceByChargeId.get(charge.id) ?? null
      };
    });

    return {
      ...this.toSummary(
        job,
        new Map([[customer.id, customer.company_name]]),
        new Map([[shipment.job_id, shipment]]),
        portsById
      ),
      customerId: customer.id,
      polId: shipment.port_of_loading_id,
      podId: shipment.port_of_discharge_id,
      transshipmentPortId: shipment.transshipment_port_id,
      vessel: shipment.vessel,
      voyage: shipment.voyage,
      hbl: shipment.hbl,
      mbl: shipment.mbl,
      services: jobServices.flatMap(item => {
        const service = servicesById.get(item.service_id);
        return service ? [{ id: service.id, code: service.code, name: service.name, defaultUom: service.default_uom, active: service.active }] : [];
      }),
      containers: (containersResult.data ?? []).map(container => ({
        id: container.id,
        containerNumber: container.container_number,
        size: String(container.size) as "20" | "40" | "45",
        containerType: container.container_type,
        sealNumber: container.seal_number
      })),
      charges: mappedCharges
    };
  }

  private toSummary(
    job: JobRow,
    customersById: Map<string, string>,
    shipmentsByJob: Map<string, { port_of_loading_id: string; port_of_discharge_id: string; transshipment_port_id: string | null }>,
    portsById: Map<string, string>
  ): JobSummary {
    const shipment = shipmentsByJob.get(job.id);
    return {
      id: job.id,
      jobNumber: job.job_number,
      customerName: customersById.get(job.customer_id) ?? "Unknown customer",
      polName: shipment ? portsById.get(shipment.port_of_loading_id) ?? "Unknown port" : "Not set",
      podName: shipment ? portsById.get(shipment.port_of_discharge_id) ?? "Unknown port" : "Not set",
      transshipmentPortName: shipment?.transshipment_port_id ? portsById.get(shipment.transshipment_port_id) ?? "Unknown port" : null,
      transportMode: job.transport_mode,
      status: job.status,
      plannedContainerType: job.planned_container_type,
      plannedContainerCount: job.planned_container_count
    };
  }
}
