import { z } from "zod";

export const uuidSchema = z.uuid();
export const decimalSchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,8})?$/, "Use a positive decimal string");
export const moneySchema = z
  .string()
  .regex(
    /^\d+(?:\.\d{1,2})?$/,
    "Use a monetary value with at most two decimals",
  );
export const currencySchema = z
  .string()
  .length(3)
  .transform((value) => value.toUpperCase());
export const transportModeSchema = z.enum(["SEA", "AIR", "ROAD", "MULTIMODAL"]);
export const jobStatusSchema = z.enum([
  "DRAFT",
  "OPEN",
  "COMPLETED",
  "READY_TO_INVOICE",
  "CANCELLED",
]);
export const invoiceStatusSchema = z.enum(["DRAFT", "ISSUED", "VOID"]);
export const roleSchema = z.enum([
  "OWNER",
  "ADMIN",
  "OPERATIONS",
  "FINANCE",
  "VIEWER",
]);

export const userContextSchema = z.object({
  userId: uuidSchema,
  email: z.string().email(),
  companyId: uuidSchema,
  companyName: z.string(),
  role: roleSchema,
  branchId: uuidSchema,
  branchName: z.string(),
});

export const managedUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  name: z.string(),
  role: roleSchema,
  active: z.boolean(),
  createdAt: z.string().datetime(),
  lastSignInAt: z.string().datetime().nullable(),
});

export const createManagedUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  role: roleSchema,
  temporaryPassword: z.string().min(12).max(128),
});

export const updateManagedUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: roleSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one change is required",
  );

export const customerSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  trn: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  billingAddress: z.string().nullable(),
  defaultCurrency: currencySchema,
  paymentTermsDays: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const saveCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  trn: z.string().trim().max(32).nullable().default(null),
  email: z
    .union([z.string().trim().email(), z.literal(""), z.null()])
    .transform((value) => value || null),
  phone: z.string().trim().max(32).nullable().default(null),
  billingAddress: z.string().trim().max(500).nullable().default(null),
  defaultCurrency: currencySchema.default("AED"),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  active: z.boolean().default(true),
});

export const portSchema = z.object({
  id: uuidSchema,
  unLocode: z.string().nullable(),
  name: z.string(),
  countryCode: z.string(),
  active: z.boolean(),
  editable: z.boolean(),
});

export const savePortSchema = z.object({
  unLocode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}[A-Z0-9]{3}$/)
    .nullable(),
  name: z.string().trim().min(1).max(160),
  countryCode: z.string().trim().toUpperCase().length(2),
  active: z.boolean().default(true),
});

export const saveServiceSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  defaultUom: z.string().trim().toUpperCase().min(1).max(16),
  defaultCurrency: currencySchema.default("AED"),
  defaultTaxRateId: uuidSchema,
  active: z.boolean().default(true),
});

export const taxRateSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  rate: decimalSchema,
});
export const branchSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
});

export const serviceSchema = z.object({
  id: uuidSchema,
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  defaultUom: z.string().trim().min(1).max(16),
  active: z.boolean(),
});

export const masterDataSchema = z.object({
  customers: z.array(customerSchema),
  ports: z.array(portSchema),
  services: z.array(
    serviceSchema.extend({
      defaultCurrency: currencySchema,
      defaultTaxRateId: uuidSchema,
    }),
  ),
  taxRates: z.array(taxRateSchema),
  branches: z.array(branchSchema),
  currencies: z.array(currencySchema),
});

export const containerSchema = z.object({
  id: uuidSchema,
  containerNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}\d{7}$/),
  size: z.enum(["20", "40", "45"]),
  containerType: z.string().trim().min(1).max(24),
  sealNumber: z.string().trim().max(64).nullable(),
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
  invoiceId: uuidSchema.nullable(),
  invoiceStatus: invoiceStatusSchema.nullable(),
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
  plannedContainerCount: z.number().int().positive(),
});

export const jobDetailSchema = jobSummarySchema.extend({
  customerId: uuidSchema,
  branchId: uuidSchema,
  polId: uuidSchema,
  podId: uuidSchema,
  transshipmentPortId: uuidSchema.nullable(),
  vessel: z.string().nullable(),
  voyage: z.string().nullable(),
  sailedDate: z.string().nullable(),
  originPort: z.string().nullable(),
  placeOfDelivery: z.string().nullable(),
  shipper: z.string().nullable(),
  consignee: z.string().nullable(),
  notifyName: z.string().nullable(),
  commodity: z.string().nullable(),
  salesPerson: z.string().nullable(),
  customerReference: z.string().nullable(),
  packageCount: z.number().int().nonnegative().nullable(),
  weightKg: z.number().nonnegative().nullable(),
  volumeCbm: z.number().nonnegative().nullable(),
  chargeableWeightKg: z.number().nonnegative().nullable(),
  customsDocReference: z.string().nullable(),
  shipmentTerms: z.string().nullable(),
  hbl: z.string().nullable(),
  mbl: z.string().nullable(),
  services: z.array(serviceSchema.extend({ jobServiceId: uuidSchema })),
  containers: z.array(containerSchema),
  charges: z.array(chargeSchema),
});

export const createChargeSchema = z
  .object({
    jobServiceId: uuidSchema,
    description: z.string().trim().min(1).max(500),
    quantity: decimalSchema,
    uom: z.string().trim().min(1).max(16),
    currency: z.enum(["AED", "USD"]),
    exchangeRate: decimalSchema,
    unitRate: moneySchema,
    taxRateId: uuidSchema,
  })
  .superRefine((value, context) => {
    const rate = Number(value.exchangeRate);
    if (rate <= 0) {
      context.addIssue({
        code: "custom",
        path: ["exchangeRate"],
        message: "Exchange rate must be greater than zero",
      });
    }
    if (value.currency === "AED" && rate !== 1) {
      context.addIssue({
        code: "custom",
        path: ["exchangeRate"],
        message: "AED exchange rate must be 1",
      });
    }
  });

export const saveJobSchema = z
  .object({
    customerId: uuidSchema,
    branchId: uuidSchema,
    transportMode: transportModeSchema,
    status: jobStatusSchema.default("OPEN"),
    plannedContainerType: z.string().trim().min(1).max(24),
    plannedContainerCount: z.number().int().positive().max(999),
    polId: uuidSchema,
    podId: uuidSchema,
    transshipmentPortId: uuidSchema.nullable().default(null),
    vessel: z.string().trim().max(160).nullable().default(null),
    voyage: z.string().trim().max(80).nullable().default(null),
    sailedDate: z
      .union([z.iso.date(), z.literal(""), z.null()])
      .transform((value) => value || null)
      .default(null),
    originPort: z.string().trim().max(160).nullable().default(null),
    placeOfDelivery: z.string().trim().max(200).nullable().default(null),
    shipper: z.string().trim().max(200).nullable().default(null),
    consignee: z.string().trim().max(200).nullable().default(null),
    notifyName: z.string().trim().max(200).nullable().default(null),
    commodity: z.string().trim().max(300).nullable().default(null),
    salesPerson: z.string().trim().max(160).nullable().default(null),
    customerReference: z.string().trim().max(120).nullable().default(null),
    packageCount: z
      .number()
      .int()
      .nonnegative()
      .max(1_000_000)
      .nullable()
      .default(null),
    weightKg: z
      .number()
      .nonnegative()
      .max(1_000_000_000)
      .nullable()
      .default(null),
    volumeCbm: z
      .number()
      .nonnegative()
      .max(1_000_000_000)
      .nullable()
      .default(null),
    chargeableWeightKg: z
      .number()
      .nonnegative()
      .max(1_000_000_000)
      .nullable()
      .default(null),
    customsDocReference: z.string().trim().max(160).nullable().default(null),
    shipmentTerms: z.string().trim().max(80).nullable().default(null),
    hbl: z.string().trim().max(100).nullable().default(null),
    mbl: z.string().trim().max(100).nullable().default(null),
    containerNumbers: z
      .array(
        z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{4}\d{7}$/),
      )
      .max(999)
      .default([])
      .refine(
        (numbers) => new Set(numbers).size === numbers.length,
        "Container numbers must be unique",
      ),
    serviceIds: z
      .array(uuidSchema)
      .min(1)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Services must be unique",
      ),
  })
  .refine((value) => value.polId !== value.podId, {
    message: "POL and POD must be different",
    path: ["podId"],
  })
  .refine(
    (value) =>
      !value.transshipmentPortId ||
      (value.transshipmentPortId !== value.polId &&
        value.transshipmentPortId !== value.podId),
    {
      message: "Transshipment port must differ from POL and POD",
      path: ["transshipmentPortId"],
    },
  )
  .refine(
    (value) => value.containerNumbers.length <= value.plannedContainerCount,
    {
      message: "Container numbers cannot exceed the planned container count",
      path: ["containerNumbers"],
    },
  )
  .refine(
    (value) =>
      !value.containerNumbers.length ||
      /^(20|40|45)/.test(value.plannedContainerType),
    {
      message:
        "Select a container equipment type before entering container numbers",
      path: ["plannedContainerType"],
    },
  );

export const saveContainerSchema = z.object({
  containerNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}\d{7}$/),
  size: z.enum(["20", "40", "45"]),
  containerType: z.string().trim().min(1).max(24),
  sealNumber: z.string().trim().max(64).nullable().default(null),
});

export const createDraftSchema = z.object({
  jobId: uuidSchema,
  chargeIds: z
    .array(uuidSchema)
    .min(1)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Charge IDs must be unique",
    ),
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
  totalAmount: moneySchema,
});

export const invoiceSchema = z.object({
  id: uuidSchema,
  draftReference: z.string(),
  invoiceNumber: z.string().nullable(),
  status: invoiceStatusSchema,
  createdAt: z.string().datetime(),
  issuedAt: z.string().datetime().nullable(),
  invoiceDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  companyName: z.string(),
  companyTrn: z.string().nullable(),
  companyAddress: z.string().nullable(),
  branchName: z.string(),
  branchAddress: z.string().nullable(),
  customerName: z.string(),
  customerTrn: z.string().nullable(),
  customerAddress: z.string().nullable(),
  paymentTermsDays: z.number().int().nonnegative(),
  jobNumber: z.string(),
  polName: z.string(),
  podName: z.string(),
  transshipmentPortName: z.string().nullable(),
  transportMode: transportModeSchema,
  vessel: z.string().nullable(),
  voyage: z.string().nullable(),
  sailedDate: z.string().nullable(),
  originPort: z.string().nullable(),
  placeOfDelivery: z.string().nullable(),
  shipper: z.string().nullable(),
  consignee: z.string().nullable(),
  notifyName: z.string().nullable(),
  commodity: z.string().nullable(),
  salesPerson: z.string().nullable(),
  customerReference: z.string().nullable(),
  packageCount: z.number().int().nonnegative().nullable(),
  weightKg: z.number().nonnegative().nullable(),
  volumeCbm: z.number().nonnegative().nullable(),
  chargeableWeightKg: z.number().nonnegative().nullable(),
  customsDocReference: z.string().nullable(),
  shipmentTerms: z.string().nullable(),
  hbl: z.string().nullable(),
  mbl: z.string().nullable(),
  plannedContainerType: z.string(),
  plannedContainerCount: z.number().int().positive(),
  containers: z.array(containerSchema),
  lines: z.array(invoiceLineSchema),
  subtotal: moneySchema,
  vatAmount: moneySchema,
  total: moneySchema,
});

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

export type Service = z.infer<typeof serviceSchema>;
export type UserContext = z.infer<typeof userContextSchema>;
export type ManagedUser = z.infer<typeof managedUserSchema>;
export type CreateManagedUser = z.infer<typeof createManagedUserSchema>;
export type UpdateManagedUser = z.infer<typeof updateManagedUserSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type Port = z.infer<typeof portSchema>;
export type MasterData = z.infer<typeof masterDataSchema>;
export type SaveCustomer = z.infer<typeof saveCustomerSchema>;
export type SavePort = z.infer<typeof savePortSchema>;
export type SaveService = z.infer<typeof saveServiceSchema>;
export type Container = z.infer<typeof containerSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type CreateCharge = z.infer<typeof createChargeSchema>;
export type SaveJob = z.infer<typeof saveJobSchema>;
export type SaveContainer = z.infer<typeof saveContainerSchema>;
export type CreateDraft = z.infer<typeof createDraftSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;

function decimalToScaled(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = `${fraction}${"0".repeat(scale)}`.slice(0, scale);
  return (
    BigInt(whole) * 10n ** BigInt(scale) + BigInt(normalizedFraction || "0")
  );
}

function roundDivision(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function calculateLineAmounts(
  quantity: string,
  unitRate: string,
  taxRate: string,
) {
  const quantityScaled = decimalToScaled(quantity, 3);
  const rateFils = decimalToScaled(unitRate, 2);
  const taxBasisPoints = decimalToScaled(taxRate, 2);
  const netFils = roundDivision(quantityScaled * rateFils, 1000n);
  const vatFils = roundDivision(netFils * taxBasisPoints, 10_000n);
  return {
    netAmount: formatMoney(netFils),
    vatAmount: formatMoney(vatFils),
    totalAmount: formatMoney(netFils + vatFils),
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
