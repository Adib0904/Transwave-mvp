import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { PostgrestError } from "@supabase/supabase-js";

const safeMessages: Record<string, string> = {
  ALLOCATED_CHARGE_LOCKED: "An invoiced charge cannot be changed",
  ISSUED_CHARGE_LOCKED:
    "This charge is locked because its invoice has been issued",
  UNSUPPORTED_CHARGE_CURRENCY: "Charges can only be entered in AED or USD",
  INVALID_EXCHANGE_RATE:
    "Enter a valid AED conversion rate; AED charges must use 1",
  JOB_SERVICE_NOT_FOUND: "Job service not found",
  ISSUED_INVOICE_LOCKED: "An issued invoice cannot be changed",
  AUTH_REQUIRED: "Authentication is required",
  CHARGES_REQUIRED: "Select at least one charge",
  DUPLICATE_CHARGE_IDS: "A charge can only be selected once",
  JOB_NOT_FOUND: "Job not found",
  FORBIDDEN: "You do not have permission to perform this action",
  CHARGE_UNAVAILABLE: "One or more charges are already invoiced or unavailable",
  INVOICE_NOT_FOUND: "Invoice not found",
  INVALID_INVOICE_STATUS: "The invoice is not in a valid state for this action",
  INVOICE_LINES_REQUIRED: "An invoice must contain at least one line",
  INVALID_ROUTE: "POL, POD and transshipment port must be different",
  INVALID_SERVICES: "Select valid, active services without duplicates",
  SERVICE_WITH_CHARGE_CANNOT_BE_REMOVED:
    "A service with a charge cannot be removed",
  FINANCE_ROLE_REQUIRED:
    "Finance permission is required for charges and invoices",
  OPERATIONS_ROLE_REQUIRED:
    "Operations permission is required to change job details",
  POSITIVE_INVOICE_TOTAL_REQUIRED:
    "An invoice total must be greater than zero before issue",
  CONTAINER_COUNT_BELOW_ACTUAL:
    "Planned container count cannot be lower than the containers already added",
  PLANNED_CONTAINER_COUNT_EXCEEDED:
    "The planned container count has already been reached",
  CUSTOMER_NUMBER_LOCKED:
    "Customer IDs are assigned automatically and cannot be changed",
  TOO_MANY_CONTAINERS:
    "Container numbers cannot exceed the planned container count",
  CONTAINER_TYPE_REQUIRED:
    "Select a container equipment type before entering container numbers",
  INVALID_CONTAINER_NUMBERS:
    "Use a valid unique container number such as MSCU1234567",
  INVALID_VENDOR: "Select an active vendor from this company",
  INVALID_VENDOR_BILL_STATUS: "Select a valid vendor bill status",
  VENDOR_BILL_LINES_REQUIRED: "Add at least one vendor invoice line",
  VENDOR_BILL_NOT_FOUND: "Vendor bill not found",
  CUSTOMER_INVOICE_JOB_MISMATCH:
    "The selected customer invoice belongs to another job",
  CUSTOMER_INVOICE_REQUIRED_FOR_REVENUE:
    "Select a customer invoice before allocating revenue",
  REVENUE_ALLOCATION_EXCEEDS_INVOICE:
    "Allocated revenue exceeds the remaining customer invoice subtotal",
};

export function throwDatabaseError(
  error: PostgrestError,
  fallback = "The database operation failed",
): never {
  const databaseMessage = error.message || "";
  const safeMessage = Object.entries(safeMessages).find(([token]) =>
    databaseMessage.includes(token),
  )?.[1];
  if (error.code === "PGRST116" || databaseMessage.includes("NOT_FOUND"))
    throw new NotFoundException(safeMessage ?? "Record not found");
  if (
    error.code === "42501" ||
    databaseMessage.includes("FORBIDDEN") ||
    databaseMessage.includes("ROLE_REQUIRED")
  )
    throw new ForbiddenException(
      safeMessage ?? "You do not have permission to perform this action",
    );
  if (error.code === "23505" || databaseMessage.includes("UNAVAILABLE"))
    throw new ConflictException(
      safeMessage ?? "A record with these details already exists",
    );
  throw new BadRequestException(safeMessage ?? fallback);
}

export function requireData<T>(
  data: T | null,
  error: PostgrestError | null,
  notFoundMessage: string,
): T {
  if (error) throwDatabaseError(error);
  if (data === null) throw new NotFoundException(notFoundMessage);
  return data;
}
