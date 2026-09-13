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
  environment.document.title = invoiceId.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "INVOICE";
  environment.addEventListener("afterprint", restore);
  timer = environment.setTimeout(restore, 60000);
  try { environment.print(); } catch (error) { restore(); throw error; }
  return restore;
}

export function invoicePrintTitle(invoice: { vessel: string | null; plannedContainerCount: number; plannedContainerType: string; invoiceDate: string | null; issuedAt: string | null; invoiceNumber: string | null }) {
  const vessel = invoice.vessel?.trim().toUpperCase() || invoice.invoiceNumber || "TRANSWAVE";
  const size = invoice.plannedContainerType.match(/\d+/)?.[0];
  const equipment = size ? `${invoice.plannedContainerCount}X${size}FT` : `${invoice.plannedContainerCount}X${invoice.plannedContainerType.toUpperCase()}`;
  const date = invoice.invoiceDate || invoice.issuedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `${vessel} ${equipment} INVOICE ${date}`;
}
