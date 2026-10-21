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
export const invoicePaymentStatusSchema = z.enum(["UNPAID", "PAID"]);
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

export const auditLogSchema = z.object({
  id: z.number(),
  actorUserId: uuidSchema,
  action: z.string(),
  entityType: z.string(),
  entityId: uuidSchema,
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});
export const auditLogPageSchema = z.object({
  items: z.array(auditLogSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const authEventSchema = z.object({ event: z.enum(["login", "logout"]) });
export type AuthEvent = z.infer<typeof authEventSchema>;

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
  vatNumber: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  billingAddress: z.string().nullable(),
  defaultCurrency: currencySchema,
  paymentTermsDays: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const saveCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  trn: z
    .union([z.string().trim().max(32), z.null()])
    .transform((value) => value || null)
    .default(null),
  vatNumber: z
    .union([z.string().trim().max(32), z.null()])
    .transform((value) => value || null)
    .default(null),
  email: z
    .union([z.string().trim().email(), z.literal(""), z.null()])
    .transform((value) => value || null),
  phone: z.string().trim().max(32).nullable().default(null),
  billingAddress: z.string().trim().max(500).nullable().default(null),
  defaultCurrency: currencySchema.default("USD"),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  active: z.boolean().default(true),
});

export const vendorSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  trn: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  defaultCurrency: currencySchema,
  paymentTermsDays: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const saveVendorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  trn: z.string().trim().max(32).nullable().default(null),
  email: z
    .union([z.string().trim().email(), z.literal(""), z.null()])
    .transform((value) => value || null),
  phone: z.string().trim().max(32).nullable().default(null),
  address: z.string().trim().max(500).nullable().default(null),
  defaultCurrency: z.enum(["AED", "USD"]).default("USD"),
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
  defaultCurrency: currencySchema.default("USD"),
  defaultTaxRateId: uuidSchema,
  active: z.boolean().default(true),
});

export const taxRateSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  rate: decimalSchema,
  category: z.enum(["STANDARD", "ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"]),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
});
export const branchSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  emirate: z.string(),
  address: z.string().nullable(),
  trn: z.string().nullable(),
  active: z.boolean(),
});

const taxRateInputSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(32),
  category: z.enum(["STANDARD", "ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"]),
  rate: z.number().min(0).max(100),
  effectiveFrom: z.iso.date(),
  effectiveTo: z.union([z.iso.date(), z.null()]).default(null),
});
export const saveTaxRateSchema = taxRateInputSchema.refine((value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, {
  message: "Effective-to date must be on or after the effective-from date",
  path: ["effectiveTo"],
});
export const updateTaxRateSchema = taxRateInputSchema.partial();

export const saveBranchSchema = z.object({
  code: z.string().trim().toUpperCase().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  emirate: z.string().trim().min(1).max(80),
  address: z.string().trim().max(500).nullable().default(null),
  trn: z.string().trim().max(32).nullable().default(null),
  active: z.boolean().default(true),
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
  vendors: z.array(vendorSchema),
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
    .min(1)
    .max(64),
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
  hbl: z.string().nullable(),
  mbl: z.string().nullable(),
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
          .min(1)
          .max(64),
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
    .min(1)
    .max(64),
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
  paymentStatus: invoicePaymentStatusSchema,
  paymentDate: z.string().nullable(),
  companyName: z.string(),
  companyTrn: z.string().nullable(),
  companyAddress: z.string().nullable(),
  branchName: z.string(),
  branchAddress: z.string().nullable(),
  customerName: z.string(),
  customerTrn: z.string().nullable(),
  customerVatNumber: z.string().nullable(),
  customerAddress: z.string().nullable(),
  remarks: z.string().nullable(),
  paymentTermsDays: z.number().int().nonnegative(),
  jobId: uuidSchema,
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

export const updateInvoiceLineSchema = z
  .object({
    id: uuidSchema,
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
    if (rate <= 0 || (value.currency === "AED" && rate !== 1)) {
      context.addIssue({
        code: "custom",
        path: ["exchangeRate"],
        message: "AED exchange rate must be 1 and USD exchange rate must be positive",
      });
    }
  });

export const updateInvoiceSchema = z.object({
  invoiceDate: z.iso.date(),
  dueDate: z.union([z.iso.date(), z.literal(""), z.null()]).transform((value) => value || null),
  paymentDate: z.union([z.iso.date(), z.literal(""), z.null()]).transform((value) => value || null).default(null),
  customerName: z.string().trim().min(1).max(200),
  customerTrn: z.union([z.string().trim().max(32), z.null()]).transform((value) => value || null).default(null),
  customerVatNumber: z.union([z.string().trim().max(32), z.null()]).transform((value) => value || null).default(null),
  customerAddress: z.string().trim().max(500).nullable().default(null),
  transportMode: transportModeSchema,
  polName: z.string().trim().min(1).max(160),
  podName: z.string().trim().min(1).max(160),
  transshipmentPortName: z.string().trim().max(160).nullable().default(null),
  vessel: z.string().trim().max(160).nullable().default(null),
  voyage: z.string().trim().max(80).nullable().default(null),
  sailedDate: z.union([z.iso.date(), z.literal(""), z.null()]).transform((value) => value || null).default(null),
  originPort: z.string().trim().max(160).nullable().default(null),
  placeOfDelivery: z.string().trim().max(200).nullable().default(null),
  shipper: z.string().trim().max(200).nullable().default(null),
  consignee: z.string().trim().max(200).nullable().default(null),
  notifyName: z.string().trim().max(200).nullable().default(null),
  commodity: z.string().trim().max(300).nullable().default(null),
  salesPerson: z.string().trim().max(160).nullable().default(null),
  customerReference: z.string().trim().max(120).nullable().default(null),
  packageCount: z.number().int().nonnegative().max(1_000_000).nullable().default(null),
  weightKg: z.number().nonnegative().max(1_000_000_000).nullable().default(null),
  volumeCbm: z.number().nonnegative().max(1_000_000_000).nullable().default(null),
  chargeableWeightKg: z.number().nonnegative().max(1_000_000_000).nullable().default(null),
  customsDocReference: z.string().trim().max(160).nullable().default(null),
  shipmentTerms: z.string().trim().max(80).nullable().default(null),
  hbl: z.string().trim().max(100).nullable().default(null),
  mbl: z.string().trim().max(100).nullable().default(null),
  plannedContainerType: z.string().trim().min(1).max(24),
  plannedContainerCount: z.number().int().positive().max(999),
  containers: z.array(containerSchema).max(999),
  remarks: z.string().trim().max(1500).nullable().default(null),
  lines: z.array(updateInvoiceLineSchema).min(1).max(100),
}).superRefine((value, context) => {
  if (value.containers.length > value.plannedContainerCount) {
    context.addIssue({
      code: "custom",
      path: ["containers"],
      message: "Container numbers cannot exceed the planned container count",
    });
  }
  const numbers = value.containers.map((container) => container.containerNumber);
  if (new Set(numbers).size !== numbers.length) {
    context.addIssue({
      code: "custom",
      path: ["containers"],
      message: "Container numbers must be unique",
    });
  }
});

export const markInvoicePaidSchema = z.object({
  paymentDate: z.iso.date(),
});

export const vendorBillStatusSchema = z.enum(["DRAFT", "APPROVED", "PAID"]);

export const vendorBillLineInputSchema = z
  .object({
    serviceId: uuidSchema.nullable().default(null),
    description: z.string().trim().min(1).max(500),
    quantity: decimalSchema,
    uom: z.string().trim().min(1).max(16),
    currency: z.enum(["AED", "USD"]),
    exchangeRate: decimalSchema,
    unitRate: moneySchema,
    taxRate: decimalSchema,
  })
  .superRefine((value, context) => {
    const rate = Number(value.exchangeRate);
    if (rate <= 0 || (value.currency === "AED" && rate !== 1)) {
      context.addIssue({
        code: "custom",
        path: ["exchangeRate"],
        message: "AED exchange rate must be 1 and USD exchange rate must be positive",
      });
    }
  });

export const saveVendorBillSchema = z.object({
  vendorId: uuidSchema,
  jobId: uuidSchema,
  customerInvoiceId: uuidSchema.nullable().default(null),
  vendorInvoiceNumber: z.string().trim().min(1).max(120),
  billDate: z.iso.date(),
  dueDate: z.union([z.iso.date(), z.literal(""), z.null()]).transform((value) => value || null),
  dateOfSupply: z.union([z.iso.date(), z.literal(""), z.null()]).transform((value) => value || null),
  blNumber: z.string().trim().max(120).nullable().default(null),
  department: z.string().trim().max(80).nullable().default(null),
  remarks: z.string().trim().max(1000).nullable().default(null),
  sourceFileName: z.string().trim().max(255).nullable().default(null),
  status: vendorBillStatusSchema.default("DRAFT"),
  revenueAllocatedAed: moneySchema.default("0.00"),
  lines: z.array(vendorBillLineInputSchema).min(1).max(100),
});

export const attachVendorDocumentSchema = z.object({
  storagePath: z.string().trim().min(1).max(600),
  fileName: z.string().trim().min(1).max(255).regex(/\.pdf$/i, "Upload a PDF file"),
});

export const vendorBillLineSchema = vendorBillLineInputSchema.extend({
  id: uuidSchema,
  lineNumber: z.number().int().positive(),
  serviceName: z.string().nullable(),
  netAmountAed: moneySchema,
  vatAmountAed: moneySchema,
  totalAmountAed: moneySchema,
});

export const vendorBillSchema = z.object({
  id: uuidSchema,
  vendorId: uuidSchema,
  vendorCode: z.string(),
  vendorName: z.string(),
  vendorTrn: z.string().nullable(),
  jobId: uuidSchema,
  jobNumber: z.string(),
  customerInvoiceId: uuidSchema.nullable(),
  customerInvoiceNumber: z.string().nullable(),
  vendorInvoiceNumber: z.string(),
  billDate: z.string(),
  dueDate: z.string().nullable(),
  dateOfSupply: z.string().nullable(),
  blNumber: z.string().nullable(),
  department: z.string().nullable(),
  remarks: z.string().nullable(),
  sourceFileName: z.string().nullable(),
  sourceFilePath: z.string().nullable(),
  status: vendorBillStatusSchema,
  revenueAllocatedAed: moneySchema,
  subtotalAed: moneySchema,
  vatAmountAed: moneySchema,
  totalAmountAed: moneySchema,
  profitAed: z.string().regex(/^-?\d+(?:\.\d{1,2})?$/),
  lines: z.array(vendorBillLineSchema),
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
export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogPage = z.infer<typeof auditLogPageSchema>;
export type CreateManagedUser = z.infer<typeof createManagedUserSchema>;
export type UpdateManagedUser = z.infer<typeof updateManagedUserSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type Vendor = z.infer<typeof vendorSchema>;
export type Port = z.infer<typeof portSchema>;
export type MasterData = z.infer<typeof masterDataSchema>;
export type SaveCustomer = z.infer<typeof saveCustomerSchema>;
export type SaveVendor = z.infer<typeof saveVendorSchema>;
export type SavePort = z.infer<typeof savePortSchema>;
export type SaveService = z.infer<typeof saveServiceSchema>;
export type SaveTaxRate = z.infer<typeof saveTaxRateSchema>;
export type SaveBranch = z.infer<typeof saveBranchSchema>;
export type Container = z.infer<typeof containerSchema>;
export type Charge = z.infer<typeof chargeSchema>;
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type CreateCharge = z.infer<typeof createChargeSchema>;
export type SaveJob = z.infer<typeof saveJobSchema>;
export type SaveContainer = z.infer<typeof saveContainerSchema>;
export type CreateDraft = z.infer<typeof createDraftSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type UpdateInvoice = z.infer<typeof updateInvoiceSchema>;
export type MarkInvoicePaid = z.infer<typeof markInvoicePaidSchema>;
export type VendorBill = z.infer<typeof vendorBillSchema>;
export type SaveVendorBill = z.infer<typeof saveVendorBillSchema>;
export type AttachVendorDocument = z.infer<typeof attachVendorDocumentSchema>;

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
