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
  environment.document.title = invoiceId.replace(/[^a-zA-Z0-9_-]+/g, "-");
  environment.addEventListener("afterprint", restore);
  timer = environment.setTimeout(restore, 60000);
  try { environment.print(); } catch (error) { restore(); throw error; }
  return restore;
}
