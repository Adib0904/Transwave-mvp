export type PreparedVendorInvoicePdf = {
  file: File;
  originalBytes: number;
  storedBytes: number;
  result: "compressed" | "unchanged" | "original-preserved";
};

/** Rewrites PDFs losslessly so invoice text and fine print remain sharp. */
export async function prepareVendorInvoicePdf(file: File): Promise<PreparedVendorInvoicePdf> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const document = await PDFDocument.load(await file.arrayBuffer(), {
      updateMetadata: false,
    });
    const bytes = await document.save({
      useObjectStreams: true,
      objectsPerTick: 50,
    });

    if (bytes.byteLength >= file.size) {
      return {
        file,
        originalBytes: file.size,
        storedBytes: file.size,
        result: "unchanged",
      };
    }

    const compressed = new File([bytes.buffer as ArrayBuffer], file.name, {
      type: "application/pdf",
      lastModified: file.lastModified,
    });
    return {
      file: compressed,
      originalBytes: file.size,
      storedBytes: compressed.size,
      result: "compressed",
    };
  } catch {
    // Keep uploads working for encrypted or unusual PDFs that cannot be safely rewritten.
    return {
      file,
      originalBytes: file.size,
      storedBytes: file.size,
      result: "original-preserved",
    };
  }
}

export function formatPdfSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function vendorInvoicePdfSizeSummary(result: PreparedVendorInvoicePdf): string {
  const original = formatPdfSize(result.originalBytes);
  const stored = formatPdfSize(result.storedBytes);
  if (result.result === "compressed") {
    const savedPercent = Math.round((1 - result.storedBytes / result.originalBytes) * 100);
    return `Optimized from ${original} to ${stored} (${savedPercent}% smaller). Text and print quality are preserved.`;
  }
  if (result.result === "unchanged") {
    return `${original} · Already compact; full-quality original retained.`;
  }
  return `${original} · This PDF could not be safely optimized, so the full-quality original is retained.`;
}
