import type { Invoice } from "@transwave/contracts";

export type InvoiceFilters = {
  dateFrom: string;
  dateTo: string;
  customer: string;
  invoiceNumber: string;
  blNumber: string;
  paymentStatus: "" | Invoice["paymentStatus"];
  invoiceStatus: "" | Invoice["status"];
  pol: string;
  pod: string;
};

export const emptyInvoiceFilters: InvoiceFilters = {
  dateFrom: "",
  dateTo: "",
  customer: "",
  invoiceNumber: "",
  blNumber: "",
  paymentStatus: "",
  invoiceStatus: "",
  pol: "",
  pod: "",
};

type FilterableInvoice = Pick<
  Invoice,
  | "createdAt"
  | "invoiceDate"
  | "customerName"
  | "invoiceNumber"
  | "draftReference"
  | "hbl"
  | "mbl"
  | "paymentStatus"
  | "status"
  | "polName"
  | "podName"
>;

const includes = (value: string | null, search: string) =>
  (value ?? "").toLocaleUpperCase().includes(search.trim().toLocaleUpperCase());

export function filterInvoices<T extends FilterableInvoice>(
  invoices: T[],
  filters: InvoiceFilters,
) {
  return invoices.filter((invoice) => {
    const invoiceDate = invoice.invoiceDate || invoice.createdAt.slice(0, 10);
    return (
      (!filters.dateFrom || invoiceDate >= filters.dateFrom) &&
      (!filters.dateTo || invoiceDate <= filters.dateTo) &&
      (!filters.customer || invoice.customerName === filters.customer) &&
      (!filters.invoiceNumber ||
        includes(invoice.invoiceNumber, filters.invoiceNumber) ||
        includes(invoice.draftReference, filters.invoiceNumber)) &&
      (!filters.blNumber ||
        includes(invoice.hbl, filters.blNumber) ||
        includes(invoice.mbl, filters.blNumber)) &&
      (!filters.paymentStatus || invoice.paymentStatus === filters.paymentStatus) &&
      (!filters.invoiceStatus || invoice.status === filters.invoiceStatus) &&
      (!filters.pol || invoice.polName === filters.pol) &&
      (!filters.pod || invoice.podName === filters.pod)
    );
  });
}

export const hasInvoiceFilters = (filters: InvoiceFilters) =>
  Object.values(filters).some(Boolean);
