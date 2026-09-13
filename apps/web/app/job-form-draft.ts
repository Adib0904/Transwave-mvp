export type JobFormDraft = {
  version: 1;
  savedAt: string;
  values: Record<string, string>;
  serviceIds: string[];
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_PREFIX = "transwave:new-job-draft:";

export function jobDraftStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function parseJobFormDraft(raw: string | null): JobFormDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<JobFormDraft>;
    if (value.version !== 1 || typeof value.savedAt !== "string" || !value.values || typeof value.values !== "object" || !Array.isArray(value.serviceIds)) return null;
    if (!Object.values(value.values).every(item => typeof item === "string") || !value.serviceIds.every(item => typeof item === "string")) return null;
    return value as JobFormDraft;
  } catch {
    return null;
  }
}

export function readJobFormDraft(userId: string, storage: DraftStorage = window.localStorage): JobFormDraft | null {
  return parseJobFormDraft(storage.getItem(jobDraftStorageKey(userId)));
}

export function saveJobFormDraft(userId: string, values: Record<string, string>, serviceIds: string[], storage: DraftStorage = window.localStorage): JobFormDraft {
  const draft: JobFormDraft = { version: 1, savedAt: new Date().toISOString(), values, serviceIds: [...new Set(serviceIds)] };
  storage.setItem(jobDraftStorageKey(userId), JSON.stringify(draft));
  return draft;
}

export function clearJobFormDraft(userId: string, storage: DraftStorage = window.localStorage): void {
  storage.removeItem(jobDraftStorageKey(userId));
}
