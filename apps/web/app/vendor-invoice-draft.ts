export type VendorInvoiceDraft = {
  version: 1;
  savedAt: string;
  vendorId: string;
  jobId: string;
  customerInvoiceId: string;
  totalAmount: string;
  currency: "AED" | "USD";
  exchangeRate: string;
  remarks: string;
  document: File | null;
};

const DATABASE_NAME = "transwave-drafts";
const STORE_NAME = "vendor-invoices";

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function useStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDraftDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function readVendorInvoiceDraft(userId: string): Promise<VendorInvoiceDraft | null> {
  const value = await useStore<VendorInvoiceDraft | undefined>("readonly", (store) => store.get(userId));
  if (!value || value.version !== 1) return null;
  return value;
}

export async function saveVendorInvoiceDraft(
  userId: string,
  draft: Omit<VendorInvoiceDraft, "version" | "savedAt">,
): Promise<void> {
  await useStore("readwrite", (store) =>
    store.put({ ...draft, version: 1, savedAt: new Date().toISOString() }, userId),
  );
}

export async function clearVendorInvoiceDraft(userId: string): Promise<void> {
  await useStore("readwrite", (store) => store.delete(userId));
}
