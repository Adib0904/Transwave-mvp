type PrintEnvironment = {
  document: { title: string };
  print: () => void;
  addEventListener: (event: string, listener: () => void) => void;
  removeEventListener: (event: string, listener: () => void) => void;
  setTimeout: (callback: () => void, milliseconds: number) => number;
  clearTimeout: (id: number) => void;
};
export function printInvoice(invoiceId: string, environment: PrintEnvironment = window): () => void {
  const previousTitle = environment.document.title;
  let timer: number | undefined;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    environment.document.title = previousTitle;
    environment.removeEventListener("afterprint", restore);
    if (timer !== undefined) environment.clearTimeout(timer);
  };
  environment.document.title = invoiceId.replace(/[\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "INVOICE";
  environment.addEventListener("afterprint", restore);
  timer = environment.setTimeout(restore, 60000);
  try { environment.print(); } catch (error) { restore(); throw error; }
  return restore;
}

export function invoicePrintTitle(invoice: { hbl: string | null; mbl: string | null; invoiceNumber: string | null; draftReference?: string }) {
  const bl = invoice.hbl || invoice.mbl || "";
  const suffix = bl.replace(/[^a-z\d]/gi, "").slice(-5).toUpperCase();
  const invoiceRef = invoice.invoiceNumber || invoice.draftReference || "INVOICE";
  return suffix ? `${invoiceRef} - BL-${suffix}` : invoiceRef;
}
