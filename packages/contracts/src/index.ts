import { z } from "zod";

export const uuidSchema = z.uuid();
export const decimalSchema = z.string().regex(/^\d+(?:\.\d{1,8})?$/, "Use a positive decimal string");
export const moneySchema = z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Use a monetary value with at most two decimals");
export const currencySchema = z.string().length(3).transform(value => value.toUpperCase());
export const transportModeSchema = z.enum(["SEA", "AIR", "ROAD", "MULTIMODAL"]);
export const jobStatusSchema = z.enum(["DRAFT", "OPEN", "COMPLETED", "READY_TO_INVOICE", "CANCELLED"]);
export const invoiceStatusSchema = z.enum(["DRAFT", "ISSUED", "VOID"]);
export const roleSchema = z.enum(["OWNER", "ADMIN", "OPERATIONS", "FINANCE", "VIEWER"]);

export const serviceSchema = z.object({
  id: uuidSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  defaultUom: z.string().trim().min(1).max(16),
  active: z.boolean()
});

export const containerSchema = z.object({
  id: uuidSchema,
  containerNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{4}\d{7}$/),
  size: z.enum(["20", "40", "45"]),
  containerType: z.string().trim().min(1).max(24),
  sealNumber: z.string().trim().max(64).nullable()
});

export const chargeSchema = z.object({
  id: uuidSchema,
  jobServiceId: uuidSchema,
  serviceId: uuidSchema,
  serviceName: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  quantity: decimalSchema,
  uom: z.string().trim().min(1).max(16),
  currency: currencySchema,
  exchangeRate: decimalSchema,
  unitRate: moneySchema,
  taxRate: decimalSchema,
  netAmount: moneySchema,
  vatAmount: moneySchema,
  totalAmount: moneySchema,
  invoiceId: uuidSchema.nullable()
});

export const jobSummarySchema = z.object({
  id: uuidSchema,
  jobNumber: z.string(),
  customerName: z.string(),
  polName: z.string(),
  podName: z.string(),
  transshipmentPortName: z.string().nullable(),
  transportMode: transportModeSchema,
  status: jobStatusSchema,
  plannedContainerType: z.string(),
  plannedContainerCount: z.number().int().positive()
});

export const jobDetailSchema = jobSummarySchema.extend({
  customerId: uuidSchema,
  polId: uuidSchema,
  podId: uuidSchema,
  transshipmentPortId: uuidSchema.nullable(),
  vessel: z.string().nullable(),
  voyage: z.string().nullable(),
  hbl: z.string().nullable(),
  mbl: z.string().nullable(),
  services: z.array(serviceSchema),
  containers: z.array(containerSchema),
  charges: z.array(chargeSchema)
});

export const createChargeSchema = z.object({
  jobServiceId: uuidSchema,
  description: z.string().trim().min(1).max(500),
  quantity: decimalSchema,
  uom: z.string().trim().min(1).max(16),
  currency: currencySchema,
  exchangeRate: decimalSchema,
  unitRate: moneySchema,
  taxRateId: uuidSchema
});

export const createDraftSchema = z.object({
  jobId: uuidSchema,
  chargeIds: z.array(uuidSchema).min(1).refine(ids => new Set(ids).size === ids.length, "Charge IDs must be unique")
});

export const invoiceLineSchema = z.object({
  id: uuidSchema,
  chargeId: uuidSchema,
  lineNumber: z.number().int().positive(),
  serviceCode: z.string(),
  serviceName: z.string(),
  description: z.string(),
  quantity: decimalSchema,
  uom: z.string(),
  currency: currencySchema,
  exchangeRate: decimalSchema,
  unitRate: moneySchema,
  taxCode: z.string(),
  taxRate: decimalSchema,
  netAmount: moneySchema,
  vatAmount: moneySchema,
  totalAmount: moneySchema
});

export const invoiceSchema = z.object({
  id: uuidSchema,
  draftReference: z.string(),
  invoiceNumber: z.string().nullable(),
  status: invoiceStatusSchema,
  createdAt: z.string().datetime(),
  issuedAt: z.string().datetime().nullable(),
  customerName: z.string(),
  customerTrn: z.string().nullable(),
  paymentTermsDays: z.number().int().nonnegative(),
  jobNumber: z.string(),
  polName: z.string(),
  podName: z.string(),
  transshipmentPortName: z.string().nullable(),
  transportMode: transportModeSchema,
  vessel: z.string().nullable(),
  voyage: z.string().nullable(),
  plannedContainerType: z.string(),
  plannedContainerCount: z.number().int().positive(),
  containers: z.array(containerSchema),
  lines: z.array(invoiceLineSchema),
  subtotal: moneySchema,
  vatAmount: moneySchema,
  total: moneySchema
});

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional()
});

export type Service = z.infer<typeof serviceSchema>;
export type Container = z.infer<typeof containerSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type CreateCharge = z.infer<typeof createChargeSchema>;
export type CreateDraft = z.infer<typeof createDraftSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;

function decimalToScaled(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = `${fraction}${"0".repeat(scale)}`.slice(0, scale);
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(normalizedFraction || "0");
}

function roundDivision(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function calculateLineAmounts(quantity: string, unitRate: string, taxRate: string) {
  const quantityScaled = decimalToScaled(quantity, 3);
  const rateFils = decimalToScaled(unitRate, 2);
  const taxBasisPoints = decimalToScaled(taxRate, 2);
  const netFils = roundDivision(quantityScaled * rateFils, 1000n);
  const vatFils = roundDivision(netFils * taxBasisPoints, 10_000n);
  return {
    netAmount: formatMoney(netFils),
    vatAmount: formatMoney(vatFils),
    totalAmount: formatMoney(netFils + vatFils)
  };
}

export function formatMoney(fils: bigint): string {
  const absolute = fils < 0n ? -fils : fils;
  const value = `${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
  return fils < 0n ? `-${value}` : value;
}

export function normalizeServiceName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}
