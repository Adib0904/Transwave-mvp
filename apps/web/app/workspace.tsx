"use client";
import { createContext, FormEvent, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type {
  Charge,
  Customer,
  Invoice,
  JobDetail,
  JobSummary,
  MasterData,
  Port,
  SaveCustomer,
  SaveJob,
  ManagedUser,
  CreateManagedUser,
  UpdateManagedUser,
  UpdateInvoice,
  SaveVendor,
  SaveVendorBill,
  SaveBranch,
  SaveTaxRate,
  Vendor,
  VendorBill,
} from "@transwave/contracts";
import { api } from "./api";
import { useAuth } from "./auth";
import { invoicePrintTitle, printInvoice } from "./print-invoice";
import { aedAmountInWords } from "./amount-in-words";
import {
  clearJobFormDraft,
  readJobFormDraft,
  saveJobFormDraft,
} from "./job-form-draft";
import { parseContainerManifest } from "./container-manifest";
import {
  clearVendorInvoiceDraft,
  readVendorInvoiceDraft,
  saveVendorInvoiceDraft,
} from "./vendor-invoice-draft";
import {
  navigationPaths,
  pageFromPathname,
  type NavigationPage,
  type Page,
} from "./navigation";
import {
  chargeAmounts,
  formatChargeRate,
  type ChargeCurrency,
} from "./charge-money";
import { shouldUppercaseApplicationInput } from "./text-input";
import {
  emptyInvoiceFilters,
  filterInvoices,
  hasInvoiceFilters,
  type InvoiceFilters,
} from "./invoice-filters";
import "./invoice-flow.css";
import "./job-editor.css";

type Dialog =
  | "customer"
  | "job"
  | "container"
  | "charge"
  | "invoice"
  | "invoiceEdit"
  | "port"
  | "service"
  | "branch"
  | "taxRate"
  | "user"
  | "vendor"
  | "vendorBill"
  | null;
type AssignedService = JobDetail["services"][number];
type Confirmation = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  run(): Promise<void>;
  cancel(): void;
};
const InlineEditorContext = createContext(false);
const money = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
});
const metricTonnes = (kilograms: number) =>
  `${(kilograms / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} MT`;
const icons: Record<NavigationPage, string> = {
  Dashboard: "▦",
  Customers: "◎",
  Jobs: "▣",
  Invoices: "◫",
  Costs: "◇",
  Masters: "⚙",
  Users: "♙",
};
const label = (value: string) => value.replaceAll("_", " ");
const vendorBillStatusLabel = (status: VendorBill["status"]) =>
  status === "DRAFT" ? "PENDING REVIEW" : label(status);
const recordRoute = (pathname: string) => {
  const [section, id] = pathname.split("/").filter(Boolean);
  return id && id !== "new" ? { section, id } : null;
};
const route = (job: JobSummary | JobDetail) =>
  [job.polName, job.transshipmentPortName, job.podName]
    .filter(Boolean)
    .join(" → ");
const message = (reason: unknown) =>
  reason instanceof Error
    ? reason.message
    : "The operation could not be completed";
const nullable = (data: FormData, name: string) =>
  String(data.get(name) || "").trim() || null;
const nullableNumber = (data: FormData, name: string) => {
  const value = String(data.get(name) ?? "").trim();
  return value === "" ? null : Number(value);
};
const weightInKg = (data: FormData, name: string, unitName: string) => {
  const value = nullableNumber(data, name);
  return value === null
    ? null
    : value * (String(data.get(unitName)) === "MT" ? 1000 : 1);
};

function uppercaseApplicationInput(event: FormEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (!shouldUppercaseApplicationInput(target.tagName, target.type, target.dataset.keepCase === "true")) return;
  const uppercase = target.value.toUpperCase();
  if (uppercase === target.value) return;
  const selectionStart = target.selectionStart;
  const selectionEnd = target.selectionEnd;
  target.value = uppercase;
  if (selectionStart !== null && selectionEnd !== null) {
    target.setSelectionRange(selectionStart, selectionEnd);
  }
}

export function Workspace() {
  const router = useRouter();
  const pathname = usePathname();
  const { session, user, signOut } = useAuth();
  const page = pageFromPathname(pathname);
  const record = recordRoute(pathname);
  const [masters, setMasters] = useState<MasterData | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [vendorBills, setVendorBills] = useState<VendorBill[]>([]);
  const [selectedVendorBill, setSelectedVendorBill] = useState<VendorBill | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingPort, setEditingPort] = useState<Port | null>(null);
  const [editingService, setEditingService] = useState<
    MasterData["services"][number] | null
  >(null);
  const [editingBranch, setEditingBranch] = useState<MasterData["branches"][number] | null>(null);
  const [editingTaxRate, setEditingTaxRate] = useState<MasterData["taxRates"][number] | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [chargeService, setChargeService] = useState<{
    service: AssignedService;
    charge?: Charge;
  } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const loadInFlight = useRef<Promise<void> | null>(null);
  const canManageOperations = ["OWNER", "ADMIN", "OPERATIONS"].includes(
    user?.role ?? "VIEWER",
  );
  const canManageBilling = ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"].includes(
    user?.role ?? "VIEWER",
  );
  const canManageCharges = ["OWNER", "ADMIN", "OPERATIONS", "FINANCE"].includes(
    user?.role ?? "VIEWER",
  );
  const canManageSetup = ["OWNER", "ADMIN", "OPERATIONS"].includes(user?.role ?? "VIEWER");
  const editorPage: NavigationPage | null =
    dialog === "job" || (dialog === "charge" && Boolean(chargeService?.charge))
      ? "Jobs"
      : dialog === "invoiceEdit"
        ? "Invoices"
        : dialog === "vendorBill" || (dialog === "vendor" && Boolean(editingVendor))
          ? "Costs"
          : dialog === "customer"
            ? "Customers"
            : (dialog === "port" && editingPort) ||
                (dialog === "service" && editingService) ||
                (dialog === "branch" && editingBranch) ||
                (dialog === "taxRate" && editingTaxRate)
              ? "Masters"
              : dialog === "user" && editingUser
                ? "Users"
                : null;

  const load = useCallback((): Promise<void> => {
    if (!session || !user) return Promise.resolve();
    if (loadInFlight.current) return loadInFlight.current;
    setBusy(true);
    setError("");
    const request = Promise.all([
      api.masters(session),
      api.jobs(session),
      api.invoices(session),
      api.vendorBills(session),
      ["OWNER", "ADMIN", "OPERATIONS"].includes(user.role)
        ? api.users(session)
        : Promise.resolve([]),
    ])
      .then(
        ([nextMasters, nextJobs, nextInvoices, nextVendorBills, nextUsers]) => {
          setMasters(nextMasters);
          setJobs(nextJobs);
          setInvoices(nextInvoices);
          setVendorBills(nextVendorBills);
          setSelectedJob((current) =>
            current && nextJobs.some((job) => job.id === current.id)
              ? current
              : null,
          );
          setUsers(nextUsers);
        },
      )
      .catch((reason: unknown) => setError(message(reason)))
      .finally(() => {
        setBusy(false);
        loadInFlight.current = null;
      });
    loadInFlight.current = request;
    return request;
  }, [session, user]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!session || !record) return;
    if (record.section === "jobs" && selectedJob?.id !== record.id) {
      void api.job(session, record.id).then(setSelectedJob).catch((reason) => setError(message(reason)));
    } else if (record.section === "invoices" && selectedInvoice?.id !== record.id) {
      void api.invoice(session, record.id).then(setSelectedInvoice).catch((reason) => setError(message(reason)));
    } else if (record.section === "costs" && selectedVendorBill?.id !== record.id) {
      void api.vendorBill(session, record.id).then(setSelectedVendorBill).catch((reason) => setError(message(reason)));
    }
  }, [pathname, record?.id, record?.section, session, selectedJob?.id, selectedInvoice?.id, selectedVendorBill?.id]);

  const goTo = (next: Page) => {
    const destination = navigationPaths[next];
    if (pathname !== destination) router.push(destination);
  };

  async function openJob(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      setSelectedJob(await api.job(session, id));
      router.push(`/jobs/${encodeURIComponent(id)}`);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(job: JobDetail) {
    if (!session) return;
    const deletedIndex = jobs.findIndex((item) => item.id === job.id);
    setBusy(true);
    setError("");
    setToast("");
    try {
      let remainingJobs: JobSummary[] | undefined;
      try {
        await api.removeJob(session, job.id);
      } catch (reason) {
        if (message(reason) !== "Job not found") throw reason;
        remainingJobs = await api.jobs(session);
        if (remainingJobs.some((item) => item.id === job.id)) throw reason;
      }
      setToast(`${job.jobNumber} deleted successfully`);
      if (remainingJobs === undefined) {
        try {
          remainingJobs = await api.jobs(session);
        } catch {
          remainingJobs = jobs.filter((item) => item.id !== job.id);
        }
      }
      const availableJobs = remainingJobs ?? [];
      setJobs(availableJobs);
      const nextIndex = Math.min(Math.max(deletedIndex, 0), availableJobs.length - 1);
      const nextJob = availableJobs[nextIndex];
      if (nextJob) {
        setSelectedJob(await api.job(session, nextJob.id));
        router.push(`/jobs/${encodeURIComponent(nextJob.id)}`);
      } else {
        setSelectedJob(null);
        router.push("/jobs");
      }
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function openInvoice(id: string) {
    if (!session) return;
    const cached = invoices.find((invoice) => invoice.id === id);
    if (cached) {
      setSelectedInvoice(cached);
      router.push(`/invoices/${encodeURIComponent(id)}`);
      return;
    }
    setBusy(true);
    try {
      setSelectedInvoice(await api.invoice(session, id));
      router.push(`/invoices/${encodeURIComponent(id)}`);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function openVendorBill(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      setSelectedVendorBill(await api.vendorBill(session, id));
      router.push(`/costs/${encodeURIComponent(id)}`);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function openVendorDocument(storagePath: string) {
    setBusy(true);
    setError("");
    try {
      const url = await api.vendorDocumentUrl(storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function act<T>(
    work: () => Promise<T>,
    after?: (value: T) => void,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const value = await work();
      after?.(value);
      setDialog(null);
      await load();
      return true;
    } catch (reason) {
      setError(message(reason));
      setBusy(false);
      return false;
    }
  }
  function confirmAction<T>(
    options: Omit<Confirmation, "run" | "cancel">,
    work: () => Promise<T>,
    after?: (value: T) => void,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      setConfirmation({
        ...options,
        run: async () => {
          setConfirmation(null);
          resolve(await act(work, after));
        },
        cancel: () => {
          setConfirmation(null);
          resolve(false);
        },
      });
    });
  }
  const nav = (next: Page) => {
    goTo(next);
    if (!editorPage) setDialog(null);
    setProfileOpen(false);
    setError("");
  };
  const openNewJob = () => {
    setSelectedJob(null);
    setDialog(null);
    setError("");
    goTo("New Job");
  };
  const closeJobPage = () => {
    goTo("Jobs");
  };
  const openNewVendorInvoice = () => {
    setSelectedVendorBill(null);
    setDialog(null);
    setError("");
    goTo("New Vendor Invoice");
  };
  const closeVendorInvoicePage = () => {
    goTo("Costs");
  };
  if (!session || !user || !masters)
    return (
      <div className="center-state">{error || "Loading company data…"}</div>
    );
  const unbilled =
    selectedJob?.charges.filter((charge) => !charge.invoiceId) ?? [];

  const pages = (Object.keys(icons) as NavigationPage[]).filter(
    (item) => item !== "Users" || ["OWNER", "ADMIN", "OPERATIONS"].includes(user.role),
  );
  const managedProfile = users.find((item) => item.id === user.userId);
  const profileName =
    managedProfile?.name ||
    user.email
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <main className="app-shell" onInputCapture={uppercaseApplicationInput}>
      <aside className="side">
        <div className="logo">
          <img
            className="brand-logo"
            src="/images/tsw-logo.png"
            alt="TransWave Shipping and Logistics"
          />
        </div>
        <p className="section-label">OPERATIONS</p>
        {pages.map((item) => (
          <button
            key={item}
            className={
              page === item ||
              (page === "New Job" && item === "Jobs") ||
              (page === "New Vendor Invoice" && item === "Costs")
                ? "menu active"
                : "menu"
            }
            onClick={() => nav(item)}
          >
            <span>{icons[item]}</span>
            {item}
          </button>
        ))}
        <div className="profile-area">
          {profileOpen && (
            <div className="profile-menu" role="dialog" aria-label="Profile">
              <div className="profile-menu-head">
                <i>{profileInitials}</i>
                <span><b>{profileName}</b><small>{label(user.role)}</small></span>
              </div>
              <dl><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Company</dt><dd>{user.companyName}</dd></div>{user.branchName&&<div><dt>Branch</dt><dd>{user.branchName}</dd></div>}</dl>
              <button className="profile-signout" onClick={() => void signOut()}>Sign out</button>
            </div>
          )}
          <button className="profile-trigger" aria-expanded={profileOpen} aria-label="Open profile" onClick={() => setProfileOpen((open) => !open)}>
            <i>{profileInitials}</i>
            <span><b>{profileName}</b><small>{label(user.role)}</small></span>
            <em>⌃</em>
          </button>
        </div>
      </aside>
      <section className="workspace" hidden={editorPage === page}>
        <header>
          <div>
            <p className="kicker">{user.companyName}</p>
            <h1>{page === "New Job" ? "Create job" : page === "New Vendor Invoice" ? "Record vendor invoice" : record ? ` ${page.slice(0, -1)} details` : page}</h1>
          </div>
          <div className="header-actions">
            {record ? (
              <button className="soft" onClick={() => goTo(page as NavigationPage)}>← Back to {page.toLowerCase()}</button>
            ) : page === "New Job" ? (
              <button className="soft" onClick={closeJobPage}>
                ← Back to jobs
              </button>
            ) : page === "New Vendor Invoice" ? (
              <button className="soft" onClick={closeVendorInvoicePage}>
                ← Back to costs
              </button>
            ) : (
              <button className="soft" onClick={() => void load()}>
                Refresh
              </button>
            )}
            {!record && page === "Customers" && canManageOperations && (
              <button
                className="button"
                onClick={() => {
                  setEditingCustomer(null);
                  setDialog("customer");
                }}
              >
                + New customer
              </button>
            )}
            {!record && page === "Jobs" && canManageOperations && (
              <button className="button" onClick={openNewJob}>
                + New job
              </button>
            )}
            {!record && page === "Costs" && canManageBilling && (
              <>
                <button className="soft" onClick={() => { setEditingVendor(null); setDialog("vendor"); }}>
                  + Vendor
                </button>
                <button className="button" onClick={openNewVendorInvoice}>
                  + Vendor invoice
                </button>
              </>
            )}
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {toast && (
          <div className="success-toast" role="status" aria-live="polite">
            <span>{toast}</span>
            <button aria-label="Dismiss notification" onClick={() => setToast("")}>×</button>
          </div>
        )}
        {busy && <div className="progress" />}
        {page === "Dashboard" && (
          <Dashboard
            jobs={jobs}
            invoices={invoices}
            onJob={openJob}
            onNavigate={nav}
            canViewFinancials={["OWNER", "ADMIN"].includes(user.role)}
          />
        )}
        {page === "Customers" && (
          <Customers
            customers={masters.customers}
            selectedId={record?.section === "customers" ? record.id : null}
            onOpen={(id) => router.push(`/customers/${encodeURIComponent(id)}`)}
            canEdit={canManageOperations}
            onEdit={(value) => {
              setEditingCustomer(value);
              setDialog("customer");
            }}
          />
        )}
        {page === "Jobs" && (
          <Jobs
            jobs={jobs}
            selected={record?.section === "jobs" ? selectedJob : null}
            canEdit={canManageOperations}
            onDelete={() => selectedJob && void confirmAction(
              {
                title: "Delete this job?",
                message: `Permanently delete ${selectedJob.jobNumber} and its containers, services and charges? Jobs with customer invoices or vendor bills cannot be deleted.`,
                confirmLabel: "Delete job",
                danger: true,
              },
              () => deleteJob(selectedJob),
            )}
            canBill={canManageCharges}
            canInvoice={canManageBilling}
            onOpen={openJob}
            detailOnly={false}
            onEdit={() => setDialog("job")}
            onContainer={() => setDialog("container")}
            onRemoveContainer={(id) =>
              void confirmAction({ title: "Remove container?", message: "The container will be removed from this job.", confirmLabel: "Remove container", danger: true },
                () => api.removeContainer(session, selectedJob!.id, id),
                setSelectedJob,
              )
            }
            onCharge={(service, charge) => {
              setChargeService({ service, charge });
              setDialog("charge");
            }}
            onRemoveCharge={(id) =>
              void confirmAction({ title: "Delete charge?", message: "This job charge will be permanently deleted.", confirmLabel: "Delete charge", danger: true },
                () => api.removeCharge(session, selectedJob!.id, id),
                setSelectedJob,
              )
            }
            onInvoice={() => setDialog("invoice")}
            onOpenInvoice={openInvoice}
          />
        )}
        {page === "New Job" && canManageOperations && (
          <JobEditor
            initial={null}
            data={masters}
            draftOwner={user.userId}
            close={closeJobPage}
            save={(input) =>
              act(
                () => api.createJob(session, input),
                (value) => {
                  setSelectedJob(value);
                  router.push(`/jobs/${encodeURIComponent(value.id)}`);
                },
              )
            }
          />
        )}
        {page === "New Vendor Invoice" && canManageBilling && (
          <NewVendorInvoiceEditor
            data={masters}
            jobs={jobs}
            invoices={invoices}
            draftOwner={user.userId}
            close={closeVendorInvoicePage}
            save={(input, file) => act(async () => {
              const saved = await api.createVendorBill(session, {
                ...input,
                status: "APPROVED",
              });
              try {
                return await api.uploadVendorDocument(session, user.companyId, saved.id, file);
              } catch (reason) {
                await api.removeVendorBill(session, saved);
                throw reason;
              }
            }, (value) => {
              setSelectedVendorBill(value);
              router.push(`/costs/${encodeURIComponent(value.id)}`);
            })}
          />
        )}
        {page === "Invoices" && (
          <Invoices
            invoices={invoices}
            selected={record?.section === "invoices" ? selectedInvoice : null}
            canIssue={canManageBilling}
            canCreateSimilar={canManageOperations}
            onEdit={() => setDialog("invoiceEdit")}
            onOpen={openInvoice}
            onCreateSimilar={() =>
              selectedInvoice &&
              void confirmAction(
                {
                  title: "Create a similar job?",
                  message: `Copy customer, shipment, services and charges from ${selectedInvoice.jobNumber}. HBL, MBL and container numbers will start empty so you can enter the new shipment details.`,
                  confirmLabel: "Create similar job",
                },
                async () => {
                  const copy = await api.createSimilarJob(session, selectedInvoice.jobId);
                  return api.updateJob(session, copy.id, {
                    customerId: copy.customerId,
                    branchId: copy.branchId,
                    transportMode: copy.transportMode,
                    status: copy.status,
                    plannedContainerType: copy.plannedContainerType,
                    plannedContainerCount: copy.plannedContainerCount,
                    polId: copy.polId,
                    podId: copy.podId,
                    transshipmentPortId: copy.transshipmentPortId,
                    vessel: copy.vessel,
                    voyage: copy.voyage,
                    sailedDate: copy.sailedDate,
                    originPort: copy.originPort,
                    placeOfDelivery: copy.placeOfDelivery,
                    shipper: copy.shipper,
                    consignee: copy.consignee,
                    notifyName: copy.notifyName,
                    commodity: copy.commodity,
                    salesPerson: copy.salesPerson,
                    customerReference: copy.customerReference,
                    packageCount: copy.packageCount,
                    weightKg: copy.weightKg,
                    volumeCbm: copy.volumeCbm,
                    chargeableWeightKg: copy.chargeableWeightKg,
                    customsDocReference: copy.customsDocReference,
                    shipmentTerms: copy.shipmentTerms,
                    hbl: null,
                    mbl: null,
                    containerNumbers: [],
                    serviceIds: copy.services.map((service) => service.id),
                  });
                },
                (value) => {
                  setSelectedJob(value);
                  router.push(`/jobs/${encodeURIComponent(value.id)}`);
                },
              )
            }
            onIssue={() =>
              selectedInvoice &&
              void act(
                () => api.issueInvoice(session, selectedInvoice.id),
                setSelectedInvoice,
              )
            }
            detailOnly={false}
          />
        )}
        {page === "Costs" && (
          <Costs
            bills={vendorBills}
            vendors={masters.vendors}
            selected={record?.section === "costs" ? selectedVendorBill : null}
            canEdit={canManageBilling}
            onOpen={openVendorBill}
            detailOnly={false}
            onEdit={() => setDialog("vendorBill")}
            onDelete={() => selectedVendorBill && void confirmAction({ title: "Delete vendor invoice?", message: `${selectedVendorBill.vendorInvoiceNumber} and its uploaded document will be permanently deleted.`, confirmLabel: "Delete invoice", danger: true }, () => api.removeVendorBill(session, selectedVendorBill), () => setSelectedVendorBill(null))}
            onVendor={(vendor) => { setEditingVendor(vendor); setDialog("vendor"); }}
            onOpenInvoice={openInvoice}
            onOpenDocument={(path) => void openVendorDocument(path)}
          />
        )}
        {page === "Masters" && (
          <Masters
            data={masters}
            canEdit={canManageSetup}
            onNewPort={() => {
              setEditingPort(null);
              setDialog("port");
            }}
            onEditPort={(value) => {
              setEditingPort(value);
              setDialog("port");
            }}
            onTogglePort={(value) =>
              void act(() =>
                api.updatePort(session, value.id, { active: !value.active }),
              )
            }
            onNewService={() => {
              setEditingService(null);
              setDialog("service");
            }}
            onEditService={(value) => {
              setEditingService(value);
              setDialog("service");
            }}
            onToggleService={(value) =>
              void act(() =>
                api.updateService(session, value.id, { active: !value.active }),
              )
            }
            onNewBranch={() => { setEditingBranch(null); setDialog("branch"); }}
            onEditBranch={(value) => { setEditingBranch(value); setDialog("branch"); }}
            onToggleBranch={(value) => void act(() => api.updateBranch(session, value.id, { active: !value.active }))}
            onNewTaxRate={() => { setEditingTaxRate(null); setDialog("taxRate"); }}
            onEditTaxRate={(value) => { setEditingTaxRate(value); setDialog("taxRate"); }}
          />
        )}
        {page === "Users" && (
          <Users
            users={users}
            currentUserId={user.userId}
            canManageOwners={user.role === "OWNER"}
            onNew={() => {
              setEditingUser(null);
              setDialog("user");
            }}
            onEdit={(value) => {
              setEditingUser(value);
              setDialog("user");
            }}
            onToggle={(value) =>
              void act(() =>
                api.updateUser(session, value.id, { active: !value.active }),
              )
            }
          />
        )}
      </section>
      {dialog === "customer" && (
        <EditorSurface inline visible={page === "Customers"}>
          <CustomerDialog
            initial={editingCustomer}
            currencies={masters.currencies}
            close={() => setDialog(null)}
            save={(input) =>
              void (editingCustomer
                ? confirmAction({ title: "Save customer changes?", message: `Update the saved details for ${editingCustomer.name}?`, confirmLabel: "Save changes" }, () => api.updateCustomer(session, editingCustomer.id, input))
                : act(() => api.createCustomer(session, input)))
            }
          />
        </EditorSurface>
      )}
      {dialog === "job" && selectedJob && (
        <EditorSurface inline visible={page === "Jobs"}>
          <JobEditor
            initial={selectedJob}
            data={masters}
            draftOwner={user.userId}
            close={() => setDialog(null)}
            save={(input) =>
              confirmAction({ title: "Save job changes?", message: `Update ${selectedJob.jobNumber} with these details?`, confirmLabel: "Save changes" },
                () => api.updateJob(session, selectedJob.id, input),
                (value) => {
                  setSelectedJob(value);
                  router.push(`/jobs/${encodeURIComponent(value.id)}`);
                },
              )
            }
          />
        </EditorSurface>
      )}
      {dialog === "container" && selectedJob && (
        <ContainerDialog
          close={() => setDialog(null)}
          save={(input) =>
            void act(
              () => api.addContainer(session, selectedJob.id, input),
              setSelectedJob,
            )
          }
        />
      )}
      {dialog === "charge" && selectedJob && chargeService && (
        <EditorSurface inline={Boolean(chargeService.charge)} visible={page === "Jobs"}>
          <ChargeDialog
            item={chargeService}
            taxes={masters.taxRates}
            currencies={masters.currencies}
            close={() => setDialog(null)}
            save={(input) =>
              void (chargeService.charge
                ? confirmAction({ title: "Update charge?", message: `Save the revised ${chargeService.service.name} charge?`, confirmLabel: "Update charge" }, () => api.saveCharge(session, selectedJob.id, input), setSelectedJob)
                : act(() => api.saveCharge(session, selectedJob.id, input), setSelectedJob))
            }
          />
        </EditorSurface>
      )}
      {dialog === "invoice" && selectedJob && (
        <InvoiceDialog
          charges={unbilled}
          containerCount={selectedJob.plannedContainerCount}
          oceanServiceIds={selectedJob.services
            .filter((service) => service.code.toUpperCase() === "OCEAN" || service.name.toLowerCase() === "ocean freight")
            .map((service) => service.id)}
          close={() => setDialog(null)}
          save={(ids) =>
            void act(
              () => api.createDraft(session, selectedJob.id, ids),
              (value) => {
                setSelectedInvoice(value);
                router.push(`/invoices/${encodeURIComponent(value.id)}`);
              },
            )
          }
        />
      )}
      {dialog === "invoiceEdit" && selectedInvoice && (
        <EditorSurface inline visible={page === "Invoices"}>
          <InvoiceEditDialog
            invoice={selectedInvoice}
            customers={masters.customers}
            taxes={masters.taxRates}
            close={() => setDialog(null)}
            save={(input) =>
              void confirmAction(
                {
                  title: "Save invoice revision?",
                  message: `${selectedInvoice.invoiceNumber || selectedInvoice.draftReference} will keep its number and status. The change will be recorded in the audit log.`,
                  confirmLabel: "Save revision",
                },
                () => api.updateInvoice(session, selectedInvoice.id, input),
                setSelectedInvoice,
              )
            }
          />
        </EditorSurface>
      )}
      {dialog === "port" && (
        <EditorSurface inline={Boolean(editingPort)} visible={page === "Masters"}>
          <PortDialog
            initial={editingPort}
            close={() => setDialog(null)}
            save={(input) =>
              void (editingPort
                ? confirmAction({ title: "Save port changes?", message: `Update ${editingPort.name}?`, confirmLabel: "Save changes" }, () => api.updatePort(session, editingPort.id, input))
                : act(() => api.createPort(session, input)))
            }
          />
        </EditorSurface>
      )}
      {dialog === "service" && (
        <EditorSurface inline={Boolean(editingService)} visible={page === "Masters"}>
          <ServiceDialog
            initial={editingService}
            data={masters}
            close={() => setDialog(null)}
            save={(input) =>
              void (editingService
                ? confirmAction({ title: "Save service changes?", message: `Update ${editingService.name}?`, confirmLabel: "Save changes" }, () => api.updateService(session, editingService.id, input))
                : act(() => api.createService(session, input)))
            }
          />
        </EditorSurface>
      )}
      {dialog === "branch" && (
        <EditorSurface inline={Boolean(editingBranch)} visible={page === "Masters"}>
          <BranchDialog
            initial={editingBranch}
            close={() => setDialog(null)}
            save={(input) => void (editingBranch
              ? confirmAction({ title: "Save branch changes?", message: `Update ${editingBranch.name}?`, confirmLabel: "Save changes" }, () => api.updateBranch(session, editingBranch.id, input))
              : act(() => api.createBranch(session, input)))}
          />
        </EditorSurface>
      )}
      {dialog === "taxRate" && (
        <EditorSurface inline={Boolean(editingTaxRate)} visible={page === "Masters"}>
          <TaxRateDialog
            initial={editingTaxRate}
            close={() => setDialog(null)}
            save={(input) => void (editingTaxRate
              ? confirmAction({ title: "Save tax rate changes?", message: `Update ${editingTaxRate.code}? Existing invoice snapshots will not change.`, confirmLabel: "Save changes" }, () => api.updateTaxRate(session, editingTaxRate.id, input))
              : act(() => api.createTaxRate(session, input)))}
          />
        </EditorSurface>
      )}
      {dialog === "user" && (
        <EditorSurface inline={Boolean(editingUser)} visible={page === "Users"}>
          <UserDialog
            initial={editingUser}
            canAssignOwner={user.role === "OWNER"}
            close={() => setDialog(null)}
            save={(input) =>
              void (editingUser
                ? confirmAction({ title: "Save user changes?", message: `Update access and profile details for ${editingUser.name}?`, confirmLabel: "Save changes" }, () => api.updateUser(
                      session,
                      editingUser.id,
                      input as UpdateManagedUser,
                    ))
                : act(() => api.createUser(session, input as CreateManagedUser)))
            }
          />
        </EditorSurface>
      )}
      {dialog === "vendor" && (
        <EditorSurface inline={Boolean(editingVendor)} visible={page === "Costs"}>
          <VendorDialog
            initial={editingVendor}
            close={() => setDialog(null)}
            save={(input) => void (editingVendor ? confirmAction({ title: "Save vendor changes?", message: `Update ${editingVendor.name}?`, confirmLabel: "Save changes" }, () => api.updateVendor(session, editingVendor.id, input)) : act(() => api.createVendor(session, input)))}
          />
        </EditorSurface>
      )}
      {dialog === "vendorBill" && (
        <EditorSurface inline visible={page === "Costs"}>
          <VendorBillDialog
            initial={selectedVendorBill}
            data={masters}
            jobs={jobs}
            invoices={invoices}
            bills={vendorBills}
            close={() => setDialog(null)}
            save={(input, file) => void confirmAction({ title: "Save vendor invoice changes?", message: "The expense, links and uploaded document will be updated.", confirmLabel: "Save changes" }, async () => {
              const saved = selectedVendorBill
                ? await api.updateVendorBill(session, selectedVendorBill.id, input)
                : await api.createVendorBill(session, input);
              if (!file) return saved;
              try {
                return await api.uploadVendorDocument(session, user.companyId, saved.id, file);
              } catch (reason) {
                if (!selectedVendorBill) await api.removeVendorBill(session, saved);
                throw reason;
              }
            }, setSelectedVendorBill)}
          />
        </EditorSurface>
      )}
      {confirmation && (
        <ConfirmationDialog
          {...confirmation}
        />
      )}
    </main>
  );
}

function Dashboard({
  jobs,
  invoices,
  onJob,
  onNavigate,
  canViewFinancials,
}: {
  jobs: JobSummary[];
  invoices: Invoice[];
  onJob(id: string): void;
  onNavigate(page: Page): void;
  canViewFinancials: boolean;
}) {
  const [revenuePeriod, setRevenuePeriod] = useState<"month" | "year" | "all">("month");
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const reportYears = [...new Set([
    currentYear,
    ...invoices.flatMap((invoice) => [invoice.paymentDate, invoice.invoiceDate, invoice.issuedAt, invoice.createdAt]
      .filter((date): date is string => Boolean(date))
      .map((date) => date.slice(0, 4))),
  ])].sort((left, right) => Number(right) - Number(left));
  const periodMatches = (date: string | null, period: "month" | "year" | "all") => {
    if (period === "all") return true;
    if (!date) return false;
    const key = date.slice(0, 10);
    return period === "month"
      ? key.startsWith(`${selectedYear}-${selectedMonth}`)
      : key.startsWith(selectedYear);
  };
  const paidInvoices = invoices.filter((invoice) => invoice.paymentStatus === "PAID");
  const issuedInvoices = invoices.filter((invoice) => invoice.status === "ISSUED");
  const revenueDate = (invoice: Invoice) => invoice.paymentDate;
  const issuedDate = (invoice: Invoice) =>
    invoice.issuedAt || invoice.invoiceDate || invoice.createdAt;
  const selectedPaidInvoices = paidInvoices.filter((invoice) => periodMatches(revenueDate(invoice), revenuePeriod));
  const selectedIssuedInvoices = issuedInvoices.filter((invoice) => periodMatches(issuedDate(invoice), revenuePeriod));
  const paidRevenue = selectedPaidInvoices.reduce((sum, invoice) => sum + Number(invoice.subtotal), 0);
  const issuedValue = selectedIssuedInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
  const monthName = new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(Number(selectedYear), Number(selectedMonth) - 1, 1));
  const periodLabel = revenuePeriod === "month" ? `${monthName} ${selectedYear}` : revenuePeriod === "year" ? selectedYear : "All time";
  const jobStatuses: JobSummary["status"][] = ["DRAFT", "OPEN", "READY_TO_INVOICE", "COMPLETED", "CANCELLED"];
  const jobsByStatus = jobStatuses.map((status) => ({
    status,
    count: jobs.filter((job) => job.status === status).length,
  }));
  const maxJobsByStatus = Math.max(1, ...jobsByStatus.map((item) => item.count));
  const trendStart = revenuePeriod === "all"
    ? new Date(now.getFullYear(), now.getMonth() - 11, 1)
    : new Date(Number(selectedYear), 0, 1);
  const monthlyTrend = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(trendStart.getFullYear(), trendStart.getMonth() + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthIssued = issuedInvoices
      .filter((invoice) => issuedDate(invoice).slice(0, 7) === key)
      .reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const monthRevenue = paidInvoices
      .filter((invoice) => revenueDate(invoice)?.slice(0, 7) === key)
      .reduce((sum, invoice) => sum + Number(invoice.subtotal), 0);
    return {
      key,
      label: new Intl.DateTimeFormat("en", { month: "short" }).format(date),
      issued: monthIssued,
      revenue: monthRevenue,
    };
  });
  const maxMonthlyValue = Math.max(1, ...monthlyTrend.flatMap((item) => [item.issued, item.revenue]));
  const invoiceStatusReport = [
    { label: "Draft", count: invoices.filter((invoice) => invoice.status === "DRAFT").length },
    { label: "Issued", count: issuedInvoices.length },
    { label: "Paid", count: paidInvoices.length },
    { label: "Unpaid", count: invoices.filter((invoice) => invoice.status === "ISSUED" && invoice.paymentStatus === "UNPAID").length },
  ];
  return (
    <>
      <div className="metrics dashboard-overview-metrics">
        <Metric
          label="Active jobs"
          value={String(
            jobs.filter((j) => !["COMPLETED", "CANCELLED"].includes(j.status))
              .length,
          )}
          note="Persisted records"
        />
        <Metric
          label="Ready to invoice"
          value={String(
            jobs.filter((j) => j.status === "READY_TO_INVOICE").length,
          )}
          note="Awaiting finance"
          good
        />
        <Metric
          label="Draft invoices"
          value={String(invoices.filter((i) => i.status === "DRAFT").length)}
          note="Not yet issued"
        />
        <Metric
          label="Completed jobs"
          value={String(jobs.filter((job) => job.status === "COMPLETED").length)}
          note="Finished shipments"
        />
      </div>
      {canViewFinancials && (
        <section className="panel dashboard-finance-panel">
          <div className="panel-head dashboard-finance-head">
            <div>
              <h2>Revenue and invoicing</h2>
              <p>{periodLabel} · AED · collected revenue excludes VAT</p>
            </div>
            <div className="dashboard-period-controls">
            <div className="dashboard-period-switch" role="group" aria-label="Revenue reporting period">
              {(["month", "year", "all"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  className={revenuePeriod === period ? "active" : ""}
                  aria-pressed={revenuePeriod === period}
                  onClick={() => setRevenuePeriod(period)}
                >
                  {period === "month" ? "Monthly" : period === "year" ? "Yearly" : "All time"}
                </button>
              ))}
            </div>
            {revenuePeriod !== "all" && <div className="dashboard-date-selectors">
              {revenuePeriod === "month" && <label>
                <span>Month</span>
                <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                  {Array.from({ length: 12 }, (_, index) => {
                    const value = String(index + 1).padStart(2, "0");
                    const month = new Intl.DateTimeFormat("en", { month: "long" }).format(new Date(2000, index, 1));
                    return <option key={value} value={value}>{month}</option>;
                  })}
                </select>
              </label>}
              <label>
                <span>Year</span>
                <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
                  {reportYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
            </div>}
            </div>
          </div>
          <div className="metrics dashboard-finance-metrics">
            <Metric label="Collected revenue" value={money.format(paidRevenue)} note={`${selectedPaidInvoices.length} paid invoices · before VAT`} />
            <Metric label="Issued value" value={money.format(issuedValue)} note={`${selectedIssuedInvoices.length} issued invoices · including VAT`} />
          </div>
          <div className="dashboard-trend" aria-label={`Monthly collected revenue and issued invoice value${revenuePeriod === "all" ? " for the past 12 months" : ` for ${selectedYear}`}`}>
            <div className="dashboard-trend-heading">
              <b>Monthly trend</b>
              <span>{revenuePeriod === "all" ? "Past 12 months" : selectedYear}</span>
            </div>
            <div className="dashboard-trend-legend"><span className="revenue-key">Collected revenue</span><span className="issued-key">Issued value</span></div>
            <div className="dashboard-trend-list">
              {monthlyTrend.map((item) => (
                <div className="dashboard-trend-row" key={item.key}>
                  <span>{item.label}</span>
                  <div className="dashboard-bar-pair">
                    <i className="revenue-bar" style={{ width: `${(item.revenue / maxMonthlyValue) * 100}%` }} title={`Revenue: ${money.format(item.revenue)}`} />
                    <i className="issued-bar" style={{ width: `${(item.issued / maxMonthlyValue) * 100}%` }} title={`Issued: ${money.format(item.issued)}`} />
                  </div>
                  <small aria-label={`Collected revenue ${money.format(item.revenue)}; issued value ${money.format(item.issued)}`}>
                    {money.format(item.revenue)} · {money.format(item.issued)}
                  </small>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <div className="dashboard-reports">
        <Panel title="Job pipeline" sub={`${jobs.length} jobs by current status`}>
          <div className="dashboard-status-list">
            {jobsByStatus.map(({ status, count }) => (
              <div className="dashboard-status-row" key={status}>
                <span>{label(status)}</span>
                <div><i style={{ width: `${(count / maxJobsByStatus) * 100}%` }} /></div>
                <b>{count}</b>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Invoice activity" sub={`${invoices.length} invoices in your visible records`}>
          <div className="dashboard-invoice-stats">
            {invoiceStatusReport.map((item) => (
              <button key={item.label} onClick={() => onNavigate("Invoices")}>
                <b>{item.count}</b><span>{item.label}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <Panel
        title="Recent jobs"
        sub="Latest company activity"
        action="View all"
        onAction={() => onNavigate("Jobs")}
      >
        <JobTable jobs={jobs.slice(0, 6)} onOpen={onJob} />
      </Panel>
    </>
  );
}
function Customers({
  customers,
  selectedId,
  onOpen,
  canEdit,
  onEdit,
}: {
  customers: Customer[];
  selectedId: string | null;
  onOpen(id: string): void;
  canEdit: boolean;
  onEdit(c: Customer): void;
}) {
  return (
    <>
    <div className={`customer-layout${selectedId ? " customer-detail-layout mobile-customer-detail" : " mobile-customer-list"}`}>
    <Panel
      title="Customer master"
      sub={`${customers.length} persisted billing profiles`}
    >
      <div className="table customers">
        <div className="thead">
          <span>Customer / ID</span>
          <span>TRN / VAT</span>
          <span>Currency</span>
          <span>Terms</span>
          <span>Status</span>
        </div>
        {customers.map((c) => (
          <button
            className="trow row-button"
            key={c.id}
            onClick={() => onOpen(c.id)}
          >
            <div>
              <b>{c.name}</b>
              <small>{c.code}</small>
            </div>
            <span>{c.trn || c.vatNumber ? [c.trn, c.vatNumber].filter(Boolean).join(" / ") : "Tax details not provided"}</span>
            <span>{c.defaultCurrency}</span>
            <span>{c.paymentTermsDays} days</span>
            <Tag text={c.active ? "ACTIVE" : "INACTIVE"} />
          </button>
        ))}
      </div>
    </Panel>
    {selectedId && (() => {
      const customer = customers.find((item) => item.id === selectedId);
      if (!customer) return <Panel title="Customer not found" sub="Unavailable record"><p className="empty-panel">This customer is unavailable. Return to the customer list and choose another record.</p></Panel>;
      return <Panel title={customer.name} sub={`${customer.code} · ${customer.active ? "Active" : "Inactive"}`} action={canEdit ? "Edit customer" : undefined} onAction={() => onEdit(customer)}>
        <div className="detail-grid"><Detail label="TRN" value={customer.trn || "—"}/><Detail label="VAT number" value={customer.vatNumber || "—"}/><Detail label="Currency" value={customer.defaultCurrency}/><Detail label="Payment terms" value={`${customer.paymentTermsDays} days`}/><Detail label="Email" value={customer.email || "—"}/><Detail label="Phone" value={customer.phone || "—"}/></div>
        <Detail label="Billing address" value={customer.billingAddress || "Not provided"}/>
      </Panel>;
    })()}
    </div>
    </>
  );
}

function Jobs(props: {
  jobs: JobSummary[];
  selected: JobDetail | null;
  canEdit: boolean;
  onDelete(): void;
  canBill: boolean;
  canInvoice: boolean;
  onOpen(id: string): void;
  onEdit(): void;
  onContainer(): void;
  onRemoveContainer(id: string): void;
  onCharge(s: AssignedService, c?: Charge): void;
  onRemoveCharge(id: string): void;
  onInvoice(): void;
  onOpenInvoice(id: string): void;
  detailOnly: boolean;
}) {
  const { jobs, selected } = props;
  return (
    <div className={`${props.detailOnly ? "job-layout record-page" : "job-layout"}${props.selected && !props.detailOnly ? " mobile-job-detail" : !props.detailOnly ? " mobile-job-list" : ""}`}>
      {!props.detailOnly && <Panel title="Jobs" sub={`${jobs.length} persisted records`}>
        <div className="job-list">
          {jobs.map((job) => (
            <button
              className={selected?.id === job.id ? "job selected" : "job"}
              key={job.id}
              onClick={() => props.onOpen(job.id)}
            >
              <b>{job.jobNumber}</b>
              <span>{job.customerName}</span>
              <small>{route(job)}</small>
              <Tag text={label(job.status)} />
            </button>
          ))}
        </div>
      </Panel>}
      {selected ? (
        <Panel
          title={selected.jobNumber}
          sub={`${selected.customerName} · ${selected.transportMode}`}
          action={props.canEdit ? "Edit job" : undefined}
          onAction={props.onEdit}
          secondaryAction={props.canEdit ? "Delete job" : undefined}
          onSecondaryAction={props.onDelete}
        >
          <div className="route-summary">
            <small>Shipment route</small>
            <strong>{route(selected)}</strong>
            <span>
              {selected.transshipmentPortName
                ? `Via ${selected.transshipmentPortName}`
                : "Direct shipment"}
            </span>
          </div>
          <div className="detail-grid shipment-details">
            <Detail label="Status" value={label(selected.status)} />
            <Detail
              label="Equipment"
              value={`${selected.plannedContainerCount} × ${selected.plannedContainerType}`}
            />
            <Detail
              label="Vessel / voyage"
              value={
                [selected.vessel, selected.voyage]
                  .filter(Boolean)
                  .join(" · ") || "Not captured"
              }
            />
            <Detail
              label="Sailed date"
              value={selected.sailedDate || "Not captured"}
            />
            <Detail
              label="Origin / delivery"
              value={
                [selected.originPort, selected.placeOfDelivery]
                  .filter(Boolean)
                  .join(" → ") || "Not captured"
              }
            />
            <Detail
              label="Shipper / consignee"
              value={
                [selected.shipper, selected.consignee]
                  .filter(Boolean)
                  .join(" → ") || "Not captured"
              }
            />
            <Detail
              label="Notify name"
              value={selected.notifyName || "Not captured"}
            />
            <Detail
              label="Customer ref"
              value={selected.customerReference || "Not captured"}
            />
            <Detail
              label="HBL / MBL"
              value={
                [selected.hbl, selected.mbl].filter(Boolean).join(" · ") ||
                "Not captured"
              }
            />
            <Detail
              label="Commodity"
              value={selected.commodity || "Not captured"}
            />
            <Detail
              label="Packages"
              value={
                selected.packageCount === null
                  ? "Not captured"
                  : `${selected.packageCount} PKGS`
              }
            />
            <Detail
              label="Weight / volume"
              value={
                [
                  selected.weightKg === null ? null : metricTonnes(selected.weightKg),
                  selected.volumeCbm === null
                    ? null
                    : `${selected.volumeCbm} CBM`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Not captured"
              }
            />
            <Detail
              label="Chargeable weight"
              value={
                selected.chargeableWeightKg === null
                  ? "Not captured"
                  : metricTonnes(selected.chargeableWeightKg)
              }
            />
            <Detail
              label="Customs doc ref"
              value={selected.customsDocReference || "Not captured"}
            />
            <Detail
              label="Terms of shipment"
              value={selected.shipmentTerms || "Not captured"}
            />
            <Detail
              label="Sales person"
              value={selected.salesPerson || "Not captured"}
            />
          </div>
          <div className="section-heading">
            <div>
              <h3>Services and charges</h3>
              <p>Each selected service has one job-specific charge.</p>
            </div>
            <span>
              {selected.services.length} service
              {selected.services.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="service-groups">
            {selected.services.map((service) => {
              const charge = selected.charges.find(
                (item) => item.serviceId === service.id,
              );
              return (
                <article
                  className={`service-group ${charge ? "priced" : "pending"}`}
                  key={service.id}
                >
                  <div className="service-identity">
                    <i>{service.code.slice(0, 3)}</i>
                    <div>
                      <b>{service.name}</b>
                      <span>
                        {charge
                          ? `${charge.description} · ${charge.quantity} ${charge.uom} × ${formatChargeRate(charge.currency, charge.unitRate)}${charge.currency === "USD" ? ` · 1 USD = ${charge.exchangeRate} AED` : ""}`
                          : `Add the agreed ${service.defaultUom} charge for this job`}
                      </span>
                    </div>
                  </div>
                  <div className="service-total">
                    <small>
                      {charge?.invoiceStatus === "ISSUED"
                        ? "Issued · locked"
                        : charge?.invoiceStatus === "DRAFT"
                          ? "Draft invoice · editable"
                          : charge
                            ? `VAT ${charge.taxRate}%`
                            : "Charge pending"}
                    </small>
                    <strong>
                      {charge ? money.format(Number(charge.totalAmount)) : "—"}
                    </strong>
                  </div>
                  {charge?.invoiceStatus === "ISSUED" && charge.invoiceId ? (
                    <button
                      className="soft compact"
                      onClick={() => props.onOpenInvoice(charge.invoiceId!)}
                    >
                      View invoice
                    </button>
                  ) : props.canBill ? (
                    <div className="service-actions">
                      <button
                        className={charge ? "soft compact" : "button compact"}
                        onClick={() => props.onCharge(service, charge)}
                      >
                        {charge ? "Edit charge" : "Add charge"}
                      </button>
                      {charge?.invoiceStatus === "DRAFT" &&
                        charge.invoiceId && (
                          <button
                            className="soft compact"
                            onClick={() =>
                              props.onOpenInvoice(charge.invoiceId!)
                            }
                          >
                            View draft
                          </button>
                        )}
                      {charge && !charge.invoiceId && (
                        <button
                          className="danger-link"
                          onClick={() => props.onRemoveCharge(charge.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="billing-summary">
            <span>
              <b>{selected.charges.filter((c) => !c.invoiceId).length}</b>{" "}
              unbilled charge
              {selected.charges.filter((c) => !c.invoiceId).length === 1
                ? ""
                : "s"}
            </span>
            {props.canInvoice && selected.charges.some((c) => !c.invoiceId) && (
              <button className="button" onClick={props.onInvoice}>
                Create invoice
              </button>
            )}
          </div>
          <div className="container-head">
            <h3>
              Containers ({selected.containers.length}/
              {selected.plannedContainerCount})
            </h3>
            {props.canEdit && (
              <button className="link-button" onClick={props.onContainer}>
                + Add container
              </button>
            )}
          </div>
          <div className="record-list">
            {selected.containers.length ? (
              selected.containers.map((c) => (
                <div key={c.id}>
                  <span>
                    <b>{c.containerNumber}</b> · {c.size}
                    {c.containerType}
                    {c.sealNumber && ` · Seal ${c.sealNumber}`}
                  </span>
                  {props.canEdit && (
                    <button
                      className="danger-link"
                      onClick={() => props.onRemoveContainer(c.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="empty-inline">No actual containers captured.</p>
            )}
          </div>
        </Panel>
      ) : (
        <Panel title="Select a job" sub="Choose a record to view details">
          <p className="empty-panel">
            Services, charges, containers and invoice allocations will appear
            here.
          </p>
        </Panel>
      )}
    </div>
  );
}

function Invoices({
  invoices,
  selected,
  canIssue,
  canCreateSimilar,
  onOpen,
  onCreateSimilar,
  onEdit,
  onIssue,
  detailOnly,
}: {
  invoices: Invoice[];
  selected: Invoice | null;
  canIssue: boolean;
  canCreateSimilar: boolean;
  onOpen(id: string): void;
  onCreateSimilar(): void;
  onEdit(): void;
  onIssue(): void;
  detailOnly: boolean;
}) {
  const [filters, setFilters] = useState<InvoiceFilters>(emptyInvoiceFilters);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const filteredInvoices = filterInvoices(invoices, filters);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const customers = [...new Set(invoices.map((invoice) => invoice.customerName))].sort();
  const loadingPorts = [...new Set(invoices.map((invoice) => invoice.polName))].sort();
  const dischargePorts = [...new Set(invoices.map((invoice) => invoice.podName))].sort();
  const updateFilter = <K extends keyof InvoiceFilters>(key: K, value: InvoiceFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 760px)");
    const syncFilterVisibility = () => setFiltersOpen(!mobile.matches);
    syncFilterVisibility();
    mobile.addEventListener("change", syncFilterVisibility);
    return () => mobile.removeEventListener("change", syncFilterVisibility);
  }, []);

  return (
    <div className={`${detailOnly ? "invoice-layout record-page" : "invoice-layout"}${selected && !detailOnly ? " mobile-invoice-detail" : !detailOnly ? " mobile-invoice-list" : ""}`}>
      {!detailOnly && <Panel
        title="Invoices"
        sub={`${filteredInvoices.length} of ${invoices.length} records`}
      >
        <div className="invoice-filter-toolbar">
          <div>
            <b>Invoice filters</b>
            <span>{activeFilterCount ? `${activeFilterCount} active` : "Narrow the list by date, customer, or status"}</span>
          </div>
          <button
            className="soft compact"
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? "Hide filters" : "Show filters"}
            {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
          </button>
        </div>
        {filtersOpen && <div className="invoice-filters">
          <div className="invoice-filter-heading">
            <b>Filter invoices</b>
            {hasInvoiceFilters(filters) && (
              <button type="button" onClick={() => setFilters(emptyInvoiceFilters)}>
                Clear all
              </button>
            )}
          </div>
          <div className="invoice-filter-grid">
            <label>
              <span>From date</span>
              <input
                type="date"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(event) => updateFilter("dateFrom", event.target.value)}
              />
            </label>
            <label>
              <span>To date</span>
              <input
                type="date"
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(event) => updateFilter("dateTo", event.target.value)}
              />
            </label>
            <label className="filter-wide">
              <span>Customer</span>
              <select
                value={filters.customer}
                onChange={(event) => updateFilter("customer", event.target.value)}
              >
                <option value="">All customers</option>
                {customers.map((customer) => (
                  <option key={customer} value={customer}>{customer}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Invoice number</span>
              <input
                value={filters.invoiceNumber}
                onChange={(event) => updateFilter("invoiceNumber", event.target.value)}
                placeholder="INV/TSW/..."
              />
            </label>
            <label>
              <span>B/L number</span>
              <input
                value={filters.blNumber}
                onChange={(event) => updateFilter("blNumber", event.target.value)}
                placeholder="HBL or MBL"
              />
            </label>
            <label>
              <span>Payment</span>
              <select
                value={filters.paymentStatus}
                onChange={(event) => updateFilter("paymentStatus", event.target.value as InvoiceFilters["paymentStatus"])}
              >
                <option value="">Paid & unpaid</option>
                <option value="PAID">Paid</option>
                <option value="UNPAID">Unpaid</option>
              </select>
            </label>
            <label>
              <span>Invoice status</span>
              <select
                value={filters.invoiceStatus}
                onChange={(event) => updateFilter("invoiceStatus", event.target.value as InvoiceFilters["invoiceStatus"])}
              >
                <option value="">Draft & issued</option>
                <option value="DRAFT">Draft</option>
                <option value="ISSUED">Issued</option>
              </select>
            </label>
            <label>
              <span>POL</span>
              <select value={filters.pol} onChange={(event) => updateFilter("pol", event.target.value)}>
                <option value="">All loading ports</option>
                {loadingPorts.map((port) => <option key={port} value={port}>{port}</option>)}
              </select>
            </label>
            <label>
              <span>POD</span>
              <select value={filters.pod} onChange={(event) => updateFilter("pod", event.target.value)}>
                <option value="">All discharge ports</option>
                {dischargePorts.map((port) => <option key={port} value={port}>{port}</option>)}
              </select>
            </label>
          </div>
        </div>}
        <div className="invoice-results-heading" aria-live="polite">
          <div>
            <b>Matching invoices</b>
            <span>{filteredInvoices.length} {filteredInvoices.length === 1 ? "invoice" : "invoices"} found</span>
          </div>
          <span className="invoice-results-count">{filteredInvoices.length}</span>
        </div>
        <div className="invoice-list">
          {filteredInvoices.map((i) => (
            <button
              className={selected?.id === i.id ? "invoice selected" : "invoice"}
              key={i.id}
              onClick={() => onOpen(i.id)}
            >
              <b>{i.invoiceNumber || i.draftReference}</b>
              <span>{i.customerName}</span>
              <Tag text={i.paymentStatus === "PAID" ? "PAID" : i.status} />
              <strong>{money.format(Number(i.total))}</strong>
            </button>
          ))}
          {!filteredInvoices.length && (
            <p className="empty-inline">No invoices match these filters.</p>
          )}
        </div>
      </Panel>}
      {selected ? (
        <section className="panel invoice-document">
          <div className="panel-head">
            <div>
              <h2>{selected.invoiceNumber || selected.draftReference}</h2>
              <p>Job {selected.jobNumber}</p>
            </div>
            <div className="status-tags">
              <Tag text={selected.status} />
              <Tag text={selected.paymentStatus} />
            </div>
          </div>
          <div className="detail-grid">
            <Detail label="Bill to" value={selected.customerName} />
            <Detail label="Customer TRN" value={selected.customerTrn || "—"} />
            <Detail label="Customer VAT" value={selected.customerVatNumber || "—"} />
            <Detail label="Billing address" value={selected.customerAddress || "—"} />
            <Detail label="Payment status" value={selected.paymentStatus} />
            <Detail
              label="Payment date"
              value={selected.paymentDate ? printDate(selected.paymentDate) : "—"}
            />
            <Detail
              label="Route"
              value={[
                selected.polName,
                selected.transshipmentPortName,
                selected.podName,
              ]
                .filter(Boolean)
                .join(" → ")}
            />
            <Detail
              label="Equipment"
              value={`${selected.plannedContainerCount} × ${selected.plannedContainerType}`}
            />
            <Detail
              label="BL number"
              value={
                [
                  selected.hbl ? `HBL: ${selected.hbl}` : null,
                  selected.mbl ? `MBL: ${selected.mbl}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"
              }
            />
          </div>
          <table className="charge-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Rate / FX</th>
                <th>VAT</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {selected.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.serviceName}
                    <small>{line.description}</small>
                  </td>
                  <td>
                    {line.quantity} {line.uom}
                  </td>
                  <td>
                    {formatChargeRate(line.currency, line.unitRate)}
                    <small>
                      {line.currency === "AED"
                        ? "1 AED = 1 AED"
                        : `1 ${line.currency} = ${line.exchangeRate} AED`}
                    </small>
                  </td>
                  <td>{money.format(Number(line.vatAmount))}</td>
                  <td>{money.format(Number(line.totalAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <span>
              Subtotal <b>{money.format(Number(selected.subtotal))}</b>
            </span>
            <span>
              VAT <b>{money.format(Number(selected.vatAmount))}</b>
            </span>
            <strong>
              Total <b>{money.format(Number(selected.total))}</b>
            </strong>
          </div>
          <div className="form-actions">
            {canCreateSimilar && (
              <button className="soft" onClick={onCreateSimilar}>
                Create similar job
              </button>
            )}
            {canIssue && (
              <button className="soft" onClick={onEdit}>
                Edit invoice
              </button>
            )}
            <button
              className="soft"
              onClick={() => printInvoice(invoicePrintTitle(selected))}
            >
              Preview invoice
            </button>
            {canIssue && selected.status === "DRAFT" && (
              <button className="button" onClick={onIssue}>
                Issue invoice
              </button>
            )}
          </div>
          <PersistedPrint invoice={selected} />
        </section>
      ) : (
        <Panel title="Select an invoice" sub="View a draft or issued invoice">
          <p className="empty-panel">
            Draft and issued invoices can be reviewed and revised by Finance.
          </p>
        </Panel>
      )}
    </div>
  );
}

function Costs({ bills, vendors, selected, canEdit, onOpen, onEdit, onDelete, onVendor, onOpenInvoice, onOpenDocument, detailOnly }: { bills: VendorBill[]; vendors: Vendor[]; selected: VendorBill | null; canEdit: boolean; onOpen(id: string): void; onEdit(): void; onDelete(): void; onVendor(vendor: Vendor): void; onOpenInvoice(id: string): void; onOpenDocument(path: string): void; detailOnly: boolean }) {
  const linkedIncome = new Map<string, number>();
  bills.forEach((bill) => {
    if (bill.customerInvoiceId) linkedIncome.set(bill.customerInvoiceId, Number(bill.revenueAllocatedAed));
  });
  const revenue = [...linkedIncome.values()].reduce((sum, value) => sum + value, 0);
  const expense = bills.reduce((sum, bill) => sum + Number(bill.subtotalAed), 0);
  const profit = revenue - expense;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return <div className={`cost-page${selected && !detailOnly ? " mobile-cost-detail" : !detailOnly ? " mobile-cost-list" : ""}`}>
    {!detailOnly && <div className="metrics cost-metrics"><Metric label="Allocated income" value={money.format(revenue)} note="Customer revenue before VAT"/><Metric label="Vendor expense" value={money.format(expense)} note="Vendor cost before VAT"/><Metric label="Gross profit" value={money.format(profit)} note="Income minus vendor expense" good={profit >= 0}/><Metric label="Gross margin" value={`${margin.toFixed(1)}%`} note="On allocated income" good={margin >= 0}/></div>}
    <div className={`${detailOnly ? "cost-layout record-page" : "cost-layout"}${selected && !detailOnly ? " mobile-cost-detail-layout" : !detailOnly ? " mobile-cost-list-layout" : ""}`}>{!detailOnly && <Panel title="Vendor invoices" sub={`${bills.length} recorded expense${bills.length === 1 ? "" : "s"}`}><div className="invoice-list">{bills.map(bill=><button className={selected?.id===bill.id?"invoice selected":"invoice"} key={bill.id} onClick={()=>onOpen(bill.id)}><b>{bill.vendorInvoiceNumber}</b><span>{bill.vendorName} · {bill.jobNumber}</span><Tag text={vendorBillStatusLabel(bill.status)}/><strong>{money.format(Number(bill.totalAmountAed))}</strong></button>)}</div></Panel>}
    {selected?<section className="panel"><div className="panel-head"><div><h2>{selected.vendorInvoiceNumber}</h2><p>{selected.vendorName} · Job {selected.jobNumber}</p></div><Tag text={vendorBillStatusLabel(selected.status)}/></div>{selected.status==="DRAFT"&&<p className="status-explainer">Pending review means this older vendor invoice has not yet been approved. Verify its PDF and amount, then update its status to Approved.</p>}<div className="detail-grid"><Detail label="Vendor TRN" value={selected.vendorTrn||"—"}/><Detail label="Bill date" value={selected.billDate}/><Detail label="B/L number" value={selected.blNumber||"—"}/><div className="detail"><small>CUSTOMER INVOICE</small>{selected.customerInvoiceId?<button className="link-button" onClick={()=>onOpenInvoice(selected.customerInvoiceId!)}>{selected.customerInvoiceNumber}</button>:<b>Not linked</b>}</div><div className="detail"><small>VENDOR INVOICE PDF</small>{selected.sourceFilePath?<button className="link-button" onClick={()=>onOpenDocument(selected.sourceFilePath!)}>View {selected.sourceFileName}</button>:<b>Not uploaded</b>}</div></div><table className="charge-table"><thead><tr><th>Vendor service</th><th>Qty</th><th>Rate / FX</th><th>Cost AED</th><th>VAT</th></tr></thead><tbody>{selected.lines.map(line=><tr key={line.id}><td>{line.serviceName||line.description}<small>{line.description}</small></td><td>{line.quantity} {line.uom}</td><td>{formatChargeRate(line.currency,line.unitRate)}<small>{line.currency==="USD"?`1 USD = ${line.exchangeRate} AED`:"1 AED = 1 AED"}</small></td><td>{money.format(Number(line.netAmountAed))}</td><td>{money.format(Number(line.vatAmountAed))}</td></tr>)}</tbody></table><div className="profit-summary"><span><small>Allocated customer income</small><b>{money.format(Number(selected.revenueAllocatedAed))}</b></span><span><small>Vendor expense before VAT</small><b>{money.format(Number(selected.subtotalAed))}</b></span><span className={Number(selected.profitAed)>=0?"positive":"negative"}><small>Gross profit</small><b>{money.format(Number(selected.profitAed))}</b></span></div>{canEdit&&<div className="form-actions"><button className="danger-link" onClick={onDelete}>Delete</button><button className="button" onClick={onEdit}>{selected.status==="DRAFT"?"Review vendor invoice":"Edit vendor invoice"}</button></div>}</section>:<Panel title="Select a vendor invoice" sub="Review its expense and gross profit"><p className="empty-panel">Link vendor expenses to customer income to see job profitability.</p></Panel>}</div>
    {!detailOnly && <Panel title="Vendor master" sub={`${vendors.length} shipping and service vendor${vendors.length===1?"":"s"}`}><div className="record-list">{vendors.length?vendors.map(vendor=><div key={vendor.id}><span><b>{vendor.name}</b><small>{vendor.code} · {vendor.defaultCurrency} · {vendor.trn||"No TRN"}</small></span><Tag text={vendor.active?"ACTIVE":"INACTIVE"}/>{canEdit&&<button className="link-button" onClick={()=>onVendor(vendor)}>Edit</button>}</div>):<p className="empty-inline">Add the first vendor before recording a vendor invoice.</p>}</div></Panel>}
  </div>;
}

type VendorBillLineDraft = SaveVendorBill["lines"][number] & { key: string };
const newVendorBillLine = (): VendorBillLineDraft => ({ key: crypto.randomUUID(), serviceId: null, description: "", quantity: "1", uom: "JOB", currency: "USD", exchangeRate: "3.685", unitRate: "0", taxRate: "0" });

function VendorDialog({initial,close,save}:{initial:Vendor|null;close():void;save(value:SaveVendor):void}) { return <Modal title={initial?"Edit vendor":"Add vendor"} close={close}><form onSubmit={event=>{event.preventDefault();const d=new FormData(event.currentTarget);save({name:String(d.get("name")),trn:nullable(d,"trn"),email:nullable(d,"email"),phone:nullable(d,"phone"),address:nullable(d,"address"),defaultCurrency:String(d.get("currency")) as "AED"|"USD",paymentTermsDays:Number(d.get("terms")),active:initial?.active??true})}}><div className="auto-number"><span>Vendor ID</span><b>{initial?.code||"Created automatically"}</b><small>Vendor invoices and costs remain linked to this record.</small></div><Field label="Legal name"><input name="name" required defaultValue={initial?.name}/></Field><div className="two"><Field label="TRN / VAT number"><input name="trn" defaultValue={initial?.trn||""}/></Field><Field label="Billing email"><input name="email" type="email" defaultValue={initial?.email||""}/></Field></div><Field label="Address"><textarea name="address" rows={3} defaultValue={initial?.address||""}/></Field><div className="three"><Field label="Phone"><input name="phone" defaultValue={initial?.phone||""}/></Field><Field label="Default currency"><select name="currency" defaultValue={initial?.defaultCurrency||"USD"}><option>USD</option><option>AED</option></select></Field><Field label="Payment terms"><input name="terms" type="number" min="0" max="365" defaultValue={initial?.paymentTermsDays??30}/></Field></div><FormButtons label="Save vendor" close={close}/></form></Modal>; }

function NewVendorInvoiceEditor({data,jobs,invoices,draftOwner,close,save}:{data:MasterData;jobs:JobSummary[];invoices:Invoice[];draftOwner:string;close():void;save(value:SaveVendorBill,file:File):Promise<boolean>}) {
  const [vendorId,setVendorId]=useState("");
  const [jobId,setJobId]=useState("");
  const [customerInvoiceId,setCustomerInvoiceId]=useState("");
  const [totalAmount,setTotalAmount]=useState("");
  const [currency,setCurrency]=useState<"AED"|"USD">("USD");
  const [exchangeRate,setExchangeRate]=useState("3.685");
  const [remarks,setRemarks]=useState("");
  const [document,setDocument]=useState<File|null>(null);
  const [restoredAt,setRestoredAt]=useState("");
  const draftReady=useRef(false);
  const jobOptions=Array.from(new Map([
    ...jobs.map(job=>[job.id,{id:job.id,jobNumber:job.jobNumber,customerName:job.customerName}] as const),
    ...invoices.map(invoice=>[invoice.jobId,{id:invoice.jobId,jobNumber:invoice.jobNumber,customerName:invoice.customerName}] as const),
  ]).values());
  const availableInvoices=invoices.filter(invoice=>invoice.jobId===jobId);
  const linkedInvoice=invoices.find(invoice=>invoice.id===customerInvoiceId);
  const expenseAed=chargeAmounts(1,Number(totalAmount)||0,currency==="AED"?1:Number(exchangeRate)||0,0).netAed;
  const incomeAed=Number(linkedInvoice?.subtotal||0);

  useEffect(()=>{
    let active=true;
    void readVendorInvoiceDraft(draftOwner).then((draft)=>{
      if(!active)return;
      if(draft){setVendorId(draft.vendorId);setJobId(draft.jobId);setCustomerInvoiceId(draft.customerInvoiceId);setTotalAmount(draft.totalAmount);setCurrency(draft.currency);setExchangeRate(draft.exchangeRate);setRemarks(draft.remarks);setDocument(draft.document);setRestoredAt(draft.savedAt)}
      draftReady.current=true;
    }).catch(()=>{draftReady.current=true});
    return()=>{active=false};
  },[draftOwner]);

  useEffect(()=>{
    if(!draftReady.current)return;
    const timer=window.setTimeout(()=>{void saveVendorInvoiceDraft(draftOwner,{vendorId,jobId,customerInvoiceId,totalAmount,currency,exchangeRate,remarks,document}).catch(()=>undefined)},250);
    return()=>window.clearTimeout(timer);
  },[customerInvoiceId,currency,document,draftOwner,exchangeRate,jobId,remarks,totalAmount,vendorId]);

  return <section className="panel vendor-invoice-editor"><div className="simple-flow-note"><b>Simple vendor invoice entry</b><span>Upload the PDF as the source of truth. Only the accounting total and the records it belongs to are captured here.</span>{restoredAt&&<small>Draft restored from {new Date(restoredAt).toLocaleString()}.</small>}</div><form onSubmit={event=>{event.preventDefault();if(!document)return;const invoiceNumber=document.name.replace(/\.pdf$/i,"").trim()||`VENDOR-${Date.now()}`;void save({vendorId,jobId,customerInvoiceId:customerInvoiceId||null,vendorInvoiceNumber:invoiceNumber,billDate:new Date().toISOString().slice(0,10),dueDate:null,dateOfSupply:null,blNumber:null,department:null,remarks:remarks||null,sourceFileName:null,status:"DRAFT",revenueAllocatedAed:"0.00",lines:[{serviceId:null,description:"Vendor invoice total",quantity:"1",uom:"INV",currency,exchangeRate:currency==="AED"?"1":exchangeRate,unitRate:totalAmount,taxRate:"0"}]},document).then(success=>{if(success)void clearVendorInvoiceDraft(draftOwner)})}}><FormSection title="Invoice and links" note="The PDF keeps the detailed invoice information"><div className="two"><Field label="Vendor"><select required value={vendorId} onChange={event=>setVendorId(event.target.value)}><option value="">Select vendor</option>{data.vendors.filter(vendor=>vendor.active).map(vendor=><option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.code}</option>)}</select></Field><Field label="Job"><select required value={jobId} onChange={event=>{setJobId(event.target.value);setCustomerInvoiceId("")}}><option value="">Select job</option>{jobOptions.map(job=><option key={job.id} value={job.id}>{job.jobNumber} · {job.customerName}</option>)}</select></Field></div><Field label="Vendor invoice PDF"><input className="file-input" type="file" accept="application/pdf,.pdf" required={!document} onChange={event=>setDocument(event.target.files?.[0]||null)}/><small className="input-help">{document?`Ready to upload: ${document.name}. This selection is preserved in your draft.`:"PDF only, maximum 25 MB."}</small></Field><Field label="Customer invoice to compare"><select value={customerInvoiceId} onChange={event=>setCustomerInvoiceId(event.target.value)}><option value="">Link later</option>{availableInvoices.map(invoice=><option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber||invoice.draftReference} · {money.format(Number(invoice.subtotal))} before VAT</option>)}</select></Field></FormSection><FormSection title="Expense total" note="One total replaces manual service-line entry"><div className="three"><Field label="Currency"><select value={currency} onChange={event=>{const value=event.target.value as "AED"|"USD";setCurrency(value);setExchangeRate(value==="AED"?"1":"3.685")}}><option>AED</option><option>USD</option></select></Field><Field label={`Total amount (${currency})`}><input required type="number" min="0.01" step="0.01" value={totalAmount} onChange={event=>setTotalAmount(event.target.value)} placeholder="0.00"/></Field><Field label="USD to AED exchange rate"><input required type="number" min="0.00000001" step="0.00000001" disabled={currency==="AED"} value={currency==="AED"?"1":exchangeRate} onChange={event=>setExchangeRate(event.target.value)}/></Field></div><div className="profit-preview"><span>Customer income <b>{customerInvoiceId?money.format(incomeAed):"Link an invoice"}</b></span><span>Vendor expense <b>{money.format(expenseAed)}</b></span><strong className={incomeAed-expenseAed>=0?"positive":"negative"}>Estimated gross profit <b>{customerInvoiceId?money.format(incomeAed-expenseAed):"—"}</b></strong></div><Field label="Internal remarks (optional)"><textarea rows={2} value={remarks} onChange={event=>setRemarks(event.target.value)}/></Field></FormSection><FormButtons label="Save vendor invoice" close={close} disabled={!vendorId||!jobId||!document||Number(totalAmount)<=0}/></form></section>;
}

function VendorBillDialog({initial,data,jobs,invoices,bills,close,save}:{initial:VendorBill|null;data:MasterData;jobs:JobSummary[];invoices:Invoice[];bills:VendorBill[];close():void;save(value:SaveVendorBill,file:File|null):void}) {
  const [jobId,setJobId]=useState(initial?.jobId||"");
  const [customerInvoiceId,setCustomerInvoiceId]=useState(initial?.customerInvoiceId||"");
  const [document,setDocument]=useState<File|null>(null);
  const [lines,setLines]=useState<VendorBillLineDraft[]>(initial?.lines.map(line=>({key:line.id,serviceId:line.serviceId,description:line.description,quantity:line.quantity,uom:line.uom,currency:line.currency as "AED"|"USD",exchangeRate:line.exchangeRate,unitRate:line.unitRate,taxRate:line.taxRate}))||[newVendorBillLine()]);
  const jobOptions = Array.from(new Map([
    ...jobs.map(job => [job.id, { id: job.id, jobNumber: job.jobNumber, customerName: job.customerName }] as const),
    ...invoices.map(invoice => [invoice.jobId, { id: invoice.jobId, jobNumber: invoice.jobNumber, customerName: invoice.customerName }] as const),
  ]).values());
  const availableInvoices=invoices.filter(invoice=>invoice.jobId===jobId);
  const linkedIncome = Number(invoices.find(invoice => invoice.id === customerInvoiceId)?.subtotal ?? 0);
  const expense=lines.reduce((sum,line)=>sum+chargeAmounts(Number(line.quantity)||0,Number(line.unitRate)||0,line.currency==="AED"?1:Number(line.exchangeRate)||0,Number(line.taxRate)||0).netAed,0);
  const updateLine=(key:string,values:Partial<VendorBillLineDraft>)=>setLines(current=>current.map(line=>line.key===key?{...line,...values}:line));
  return <Modal title={initial?"Edit vendor invoice":"Record vendor invoice"} wide close={close}><form onSubmit={event=>{event.preventDefault();const d=new FormData(event.currentTarget);save({vendorId:String(d.get("vendor")),jobId,customerInvoiceId:customerInvoiceId||null,vendorInvoiceNumber:String(d.get("number")),billDate:String(d.get("billDate")),dueDate:String(d.get("dueDate"))||null,dateOfSupply:String(d.get("supplyDate"))||null,blNumber:nullable(d,"bl"),department:nullable(d,"department"),remarks:nullable(d,"remarks"),sourceFileName:initial?.sourceFileName||null,status:String(d.get("status")) as SaveVendorBill["status"],revenueAllocatedAed:"0.00",lines:lines.map(({key,...line})=>line)},document)}}><FormSection title="Vendor invoice" note="Supplier, job and source document"><div className="three"><Field label="Vendor"><select name="vendor" required defaultValue={initial?.vendorId||""}><option value="">Select vendor</option>{data.vendors.filter(v=>v.active||v.id===initial?.vendorId).map(v=><option value={v.id} key={v.id}>{v.name} · {v.code}</option>)}</select></Field><Field label="Job"><select name="job" required value={jobId} onChange={event=>{setJobId(event.target.value);setCustomerInvoiceId("")}}><option value="">Select job</option>{jobOptions.map(job=><option value={job.id} key={job.id}>{job.jobNumber} · {job.customerName}</option>)}</select></Field><Field label="Vendor invoice no."><input name="number" required defaultValue={initial?.vendorInvoiceNumber}/></Field></div><div className="three"><Field label="Invoice date"><input name="billDate" type="date" required defaultValue={initial?.billDate||new Date().toISOString().slice(0,10)}/></Field><Field label="Date of supply"><input name="supplyDate" type="date" defaultValue={initial?.dateOfSupply||""}/></Field><Field label="Due date"><input name="dueDate" type="date" defaultValue={initial?.dueDate||""}/></Field></div><div className="three"><Field label="B/L number"><input name="bl" defaultValue={initial?.blNumber||""}/></Field><Field label="Department"><input name="department" defaultValue={initial?.department||""}/></Field><Field label="Status"><select name="status" defaultValue={initial?.status||"DRAFT"}><option>DRAFT</option><option>APPROVED</option><option>PAID</option></select></Field></div><Field label={initial?.sourceFilePath?"Replace vendor invoice PDF":"Upload vendor invoice PDF"}><input className="file-input" type="file" accept="application/pdf,.pdf" required={!initial?.sourceFilePath} onChange={event=>setDocument(event.target.files?.[0]||null)}/><small className="input-help">{initial?.sourceFileName?`Currently uploaded: ${initial.sourceFileName}. Select a new PDF only to replace it.`:"PDF only, maximum 25 MB. The document is stored privately for your company."}</small></Field></FormSection>
  <FormSection title="Expense lines" note="Amounts are converted and reported in AED"><div className="vendor-line-head"><span>Description / service</span><span>Qty / unit</span><span>Currency / FX</span><span>Rate</span><span>VAT %</span></div>{lines.map((line,index)=><div className="vendor-line" key={line.key}><div><select aria-label={`Line ${index+1} service`} value={line.serviceId||""} onChange={event=>{const service=data.services.find(item=>item.id===event.target.value);updateLine(line.key,{serviceId:event.target.value||null,description:line.description||service?.name||"",uom:line.uom||service?.defaultUom||"JOB"})}}><option value="">Other expense</option>{data.services.map(service=><option value={service.id} key={service.id}>{service.name}</option>)}</select><input aria-label={`Line ${index+1} description`} required value={line.description} onChange={event=>updateLine(line.key,{description:event.target.value})} placeholder="Ocean freight"/></div><div><input aria-label={`Line ${index+1} quantity`} required type="number" min="0.001" step="0.001" value={line.quantity} onChange={event=>updateLine(line.key,{quantity:event.target.value})}/><input aria-label={`Line ${index+1} unit`} required value={line.uom} onChange={event=>updateLine(line.key,{uom:event.target.value})}/></div><div><select aria-label={`Line ${index+1} currency`} value={line.currency} onChange={event=>updateLine(line.key,{currency:event.target.value as "AED"|"USD",exchangeRate:event.target.value==="AED"?"1":"3.685"})}><option>AED</option><option>USD</option></select><input aria-label={`Line ${index+1} exchange rate`} required type="number" min="0.00000001" step="0.00000001" disabled={line.currency==="AED"} value={line.currency==="AED"?"1":line.exchangeRate} onChange={event=>updateLine(line.key,{exchangeRate:event.target.value})}/></div><input aria-label={`Line ${index+1} rate`} required type="number" min="0" step="0.01" value={line.unitRate} onChange={event=>updateLine(line.key,{unitRate:event.target.value})}/><div><input aria-label={`Line ${index+1} VAT`} required type="number" min="0" step="0.01" value={line.taxRate} onChange={event=>updateLine(line.key,{taxRate:event.target.value})}/><button className="danger-link" type="button" disabled={lines.length===1} onClick={()=>setLines(current=>current.filter(item=>item.key!==line.key))}>Remove</button></div></div>)}<button className="link-button" type="button" onClick={()=>setLines(current=>[...current,newVendorBillLine()])}>+ Add expense line</button><div className="dialog-total"><span>Vendor expense before VAT</span><b>{money.format(expense)}</b></div></FormSection>
  <FormSection title="Customer invoice and profit" note="Customer income is taken automatically from the linked invoice"><Field label="Customer invoice"><select name="customerInvoice" value={customerInvoiceId} onChange={event=>setCustomerInvoiceId(event.target.value)}><option value="">Not linked yet</option>{availableInvoices.map(invoice=><option value={invoice.id} key={invoice.id}>{invoice.invoiceNumber||invoice.draftReference} · {money.format(Number(invoice.subtotal))} before VAT</option>)}</select></Field><div className="profit-preview"><span>Customer income <b>{customerInvoiceId?money.format(linkedIncome):"Link an invoice"}</b></span><span>Vendor expense <b>{money.format(expense)}</b></span><strong className={linkedIncome-expense>=0?"positive":"negative"}>Gross profit <b>{customerInvoiceId?money.format(linkedIncome-expense):"—"}</b></strong></div><Field label="Remarks"><textarea name="remarks" rows={2} defaultValue={initial?.remarks||""}/></Field></FormSection><FormButtons label={initial?"Update vendor invoice":"Save vendor invoice"} close={close} disabled={!data.vendors.length||!jobId||!lines.every(line=>line.description)||(!initial?.sourceFilePath&&!document)}/></form></Modal>;
}

function Masters({
  data,
  canEdit,
  onNewPort,
  onEditPort,
  onTogglePort,
  onNewService,
  onEditService,
  onToggleService,
  onNewBranch,
  onEditBranch,
  onToggleBranch,
  onNewTaxRate,
  onEditTaxRate,
}: {
  data: MasterData;
  canEdit: boolean;
  onNewPort(): void;
  onEditPort(p: Port): void;
  onTogglePort(p: Port): void;
  onNewService(): void;
  onEditService(s: MasterData["services"][number]): void;
  onToggleService(s: MasterData["services"][number]): void;
  onNewBranch(): void;
  onEditBranch(branch: MasterData["branches"][number]): void;
  onToggleBranch(branch: MasterData["branches"][number]): void;
  onNewTaxRate(): void;
  onEditTaxRate(taxRate: MasterData["taxRates"][number]): void;
}) {
  return (
    <div className="master-grid">
      <Panel
        title="Ports"
        sub="Shared catalogue and company ports"
        action={canEdit ? "+ Add port" : undefined}
        onAction={onNewPort}
      >
        <div className="record-list">
          {data.ports.map((p) => (
            <div key={p.id}>
              <span>
                <b>{p.name}</b>
                <small>
                  {p.unLocode || p.countryCode} ·{" "}
                  {p.editable ? "Company" : "Shared"}
                </small>
              </span>
              <Tag text={p.active ? "ACTIVE" : "INACTIVE"} />
              {canEdit && p.editable && (
                <>
                  <button className="link-button" onClick={() => onEditPort(p)}>
                    Edit
                  </button>
                  <button
                    className="danger-link"
                    onClick={() => onTogglePort(p)}
                  >
                    {p.active ? "Deactivate" : "Activate"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Services"
        sub="Price entered separately on each job"
        action={canEdit ? "+ Add service" : undefined}
        onAction={onNewService}
      >
        <div className="record-list">
          {data.services.map((s) => (
            <div key={s.id}>
              <span>
                <b>{s.name}</b>
                <small>
                  {s.code} · {s.defaultUom}
                </small>
              </span>
              <Tag text={s.active ? "ACTIVE" : "INACTIVE"} />
              {canEdit && (
                <>
                  <button
                    className="link-button"
                    onClick={() => onEditService(s)}
                  >
                    Edit
                  </button>
                  <button
                    className="danger-link"
                    onClick={() => onToggleService(s)}
                  >
                    {s.active ? "Deactivate" : "Activate"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Branches" sub="Company locations used on jobs and invoices" action={canEdit ? "+ Add branch" : undefined} onAction={onNewBranch}>
        <div className="record-list">
          {data.branches.map((branch) => <div key={branch.id}><span><b>{branch.name}</b><small>{branch.code} · {branch.emirate}</small></span><Tag text={branch.active ? "ACTIVE" : "INACTIVE"}/>{canEdit&&<><button className="link-button" onClick={()=>onEditBranch(branch)}>Edit</button><button className="danger-link" onClick={()=>onToggleBranch(branch)}>{branch.active?"Deactivate":"Activate"}</button></>}</div>)}
        </div>
      </Panel>
      <Panel title="Tax rates" sub="VAT defaults for services and new charges" action={canEdit ? "+ Add tax rate" : undefined} onAction={onNewTaxRate}>
        <div className="record-list">
          {data.taxRates.map((tax) => <div key={tax.id}><span><b>{tax.code} · {tax.rate}%</b><small>{label(tax.category)} · from {tax.effectiveFrom}</small></span>{canEdit&&<button className="link-button" onClick={()=>onEditTaxRate(tax)}>Edit</button>}</div>)}
        </div>
        <Detail label="Currencies" value={data.currencies.join(" · ")} />
      </Panel>
    </div>
  );
}

function Users({
  users,
  currentUserId,
  canManageOwners,
  onNew,
  onEdit,
  onToggle,
}: {
  users: ManagedUser[];
  currentUserId: string;
  canManageOwners: boolean;
  onNew(): void;
  onEdit(user: ManagedUser): void;
  onToggle(user: ManagedUser): void;
}) {
  return (
    <Panel
      title="Portal users"
      sub={`${users.length} company account${users.length === 1 ? "" : "s"}`}
      action="+ Add user"
      onAction={onNew}
    >
      <p className="form-help">
        Owners, administrators and operations users can create accounts, assign
        non-owner roles and suspend access. Only an owner can grant or change owner access.
      </p>
      <div className="user-table">
        <div className="user-row heading">
          <span>User</span>
          <span>Role</span>
          <span>Last sign-in</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {users.map((user) => (
          <div className="user-row" key={user.id}>
            <span>
              <b>{user.name}</b>
              <small>
                {user.email}
                {user.id === currentUserId ? " · You" : ""}
              </small>
            </span>
            <Tag text={label(user.role)} />
            <span>
              {user.lastSignInAt
                ? new Date(user.lastSignInAt).toLocaleString()
                : "Never"}
            </span>
            <Tag text={user.active ? "ACTIVE" : "INACTIVE"} />
            <span className="service-actions">
              {(canManageOwners || user.role !== "OWNER") && (
                <button className="link-button" onClick={() => onEdit(user)}>
                  Edit
                </button>
              )}
              {user.id !== currentUserId &&
                (canManageOwners || user.role !== "OWNER") && (
                  <button
                    className="danger-link"
                    onClick={() => onToggle(user)}
                  >
                    {user.active ? "Deactivate" : "Activate"}
                  </button>
                )}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CustomerDialog({
  initial,
  currencies,
  close,
  save,
}: {
  initial: Customer | null;
  currencies: string[];
  close(): void;
  save(v: SaveCustomer): void;
}) {
  return (
    <Modal title={initial ? "Edit customer" : "Create customer"} close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const d = new FormData(event.currentTarget);
          save({
            name: String(d.get("name")),
            trn: nullable(d, "trn"),
            vatNumber: nullable(d, "vatNumber"),
            email: nullable(d, "email"),
            phone: nullable(d, "phone"),
            billingAddress: nullable(d, "address"),
            defaultCurrency: String(d.get("currency")),
            paymentTermsDays: Number(d.get("terms")),
            active: initial?.active ?? true,
          });
        }}
      >
        <div className="auto-number">
          <span>Customer ID</span>
          <b>{initial?.code || "Created automatically"}</b>
          <small>
            {initial
              ? "This permanent customer ID cannot be changed."
              : "The next CST/YYYY/00000 reference is assigned when you save."}
          </small>
        </div>
        <Field label="Company name">
          <input name="name" required defaultValue={initial?.name} />
        </Field>
        <div className="two">
          <Field label="TRN number">
            <input
              name="trn"
              maxLength={32}
              defaultValue={initial?.trn || ""}
            />
            <small className="input-help">Customer Tax Registration Number.</small>
          </Field>
          <Field label="VAT number">
            <input
              name="vatNumber"
              maxLength={32}
              defaultValue={initial?.vatNumber || ""}
            />
          </Field>
        </div>
        <Field label="Billing email">
          <input name="email" type="email" defaultValue={initial?.email || ""} />
        </Field>
        <Field label="Billing address">
          <input name="address" defaultValue={initial?.billingAddress || ""} />
        </Field>
        <div className="two">
          <Field label="Phone">
            <input name="phone" defaultValue={initial?.phone || ""} />
          </Field>
          <Field label="Currency">
            <select
              name="currency"
              defaultValue={initial?.defaultCurrency || "USD"}
            >
              {currencies.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Payment terms (days)">
          <input
            name="terms"
            type="number"
            min="0"
            max="365"
            defaultValue={initial?.paymentTermsDays ?? 30}
          />
        </Field>
        <FormButtons label="Save customer" close={close} />
      </form>
    </Modal>
  );
}

function JobEditor({
  initial,
  data,
  draftOwner,
  close,
  save,
}: {
  initial: JobDetail | null;
  data: MasterData;
  draftOwner: string;
  close(): void;
  save(v: SaveJob): Promise<boolean>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [serviceIds, setServiceIds] = useState(
    initial?.services.map((s) => s.id) ?? [],
  );
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [detectedContainers, setDetectedContainers] = useState(
    initial?.containers.length ?? 0,
  );

  useEffect(() => {
    if (initial || !formRef.current) return;
    const draft = readJobFormDraft(draftOwner);
    if (!draft) return;
    for (const [name, value] of Object.entries(draft.values)) {
      const control = formRef.current.elements.namedItem(name);
      if (control && "value" in control) control.value = value;
    }
    const availableServices = new Set(
      data.services.map((service) => service.id),
    );
    setServiceIds(draft.serviceIds.filter((id) => availableServices.has(id)));
    setDraftSavedAt(draft.savedAt);
    const detected = parseContainerManifest(
      draft.values.containerNumbers ?? "",
    ).length;
    setDetectedContainers(detected);
    const countInput = formRef.current.elements.namedItem(
      "count",
    ) as HTMLInputElement | null;
    if (countInput && detected) countInput.value = String(detected);
  }, [data.services, draftOwner, initial]);

  function persistDraft(form: HTMLFormElement, nextServiceIds = serviceIds) {
    if (initial) return;
    const values = Object.fromEntries(
      Array.from(new FormData(form).entries()).flatMap(([name, value]) =>
        typeof value === "string" ? [[name, value]] : [],
      ),
    );
    setDraftSavedAt(
      saveJobFormDraft(draftOwner, values, nextServiceIds).savedAt,
    );
  }

  function toggleService(id: string, checked: boolean) {
    const next = checked
      ? [...new Set([...serviceIds, id])]
      : serviceIds.filter((item) => item !== id);
    setServiceIds(next);
    if (formRef.current) persistDraft(formRef.current, next);
  }

  function discardDraft() {
    clearJobFormDraft(draftOwner);
    formRef.current?.reset();
    setServiceIds([]);
    setDraftSavedAt(null);
    setDetectedContainers(0);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const d = new FormData(event.currentTarget);
    const containerManifest = String(d.get("containerNumbers") || "");
    const containerNumbers = parseContainerManifest(containerManifest);
    if (containerManifest.trim() && !containerNumbers.length) {
      const input = event.currentTarget.elements.namedItem(
        "containerNumbers",
      ) as HTMLTextAreaElement | null;
      input?.setCustomValidity(
        "No valid container numbers found. Use four letters followed by seven digits, for example DOLU2008497.",
      );
      input?.reportValidity();
      return;
    }
    void save({
      customerId: String(d.get("customerId")),
      branchId: String(d.get("branchId")),
      transportMode: String(d.get("mode")) as SaveJob["transportMode"],
      status: String(d.get("status")) as SaveJob["status"],
      plannedContainerType: String(d.get("equipment")),
      plannedContainerCount: Number(d.get("count")),
      polId: String(d.get("pol")),
      podId: String(d.get("pod")),
      transshipmentPortId: nullable(d, "tp"),
      vessel: nullable(d, "vessel"),
      voyage: nullable(d, "voyage"),
      sailedDate: nullable(d, "sailedDate"),
      originPort: nullable(d, "originPort"),
      placeOfDelivery: nullable(d, "placeOfDelivery"),
      shipper: nullable(d, "shipper"),
      consignee: nullable(d, "consignee"),
      notifyName: nullable(d, "notifyName"),
      commodity: nullable(d, "commodity"),
      salesPerson: nullable(d, "salesPerson"),
      customerReference: nullable(d, "customerReference"),
      packageCount: nullableNumber(d, "packageCount"),
      weightKg: weightInKg(d, "weightKg", "weightUnit"),
      volumeCbm: nullableNumber(d, "volumeCbm"),
      chargeableWeightKg: weightInKg(
        d,
        "chargeableWeightKg",
        "chargeableWeightUnit",
      ),
      customsDocReference: nullable(d, "customsDocReference"),
      shipmentTerms: nullable(d, "shipmentTerms"),
      hbl: nullable(d, "hbl"),
      mbl: nullable(d, "mbl"),
      containerNumbers,
      serviceIds,
    }).then((success) => {
      if (success && !initial) clearJobFormDraft(draftOwner);
    });
  }
  const form = (
    <form
      ref={formRef}
      className="job-form"
      onChange={(event) => {
        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        if (target.name === "containerNumbers") {
          const detected = parseContainerManifest(target.value).length;
          setDetectedContainers(detected);
          const countInput = event.currentTarget.elements.namedItem(
            "count",
          ) as HTMLInputElement | null;
          if (countInput && detected) countInput.value = String(detected);
        }
        if (target.type !== "checkbox") persistDraft(event.currentTarget);
      }}
      onSubmit={submit}
    >
      {!initial && (
        <div className="draft-notice" role="status">
          <span>
            {draftSavedAt
              ? `Draft saved in this browser at ${new Date(draftSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Your entries will be saved automatically in this browser."}
          </span>
          {draftSavedAt && (
            <button type="button" onClick={discardDraft}>
              Discard draft
            </button>
          )}
        </div>
      )}
      <div className="auto-number">
        <span>Job reference</span>
        <b>{initial?.jobNumber || "Created automatically"}</b>
        <small>
          {initial
            ? "Assigned automatically and cannot be changed."
            : "The next reference will be assigned when you save this job."}
        </small>
      </div>
      <FormSection title="Customer and route" note="Billing party and movement">
        <div className="two">
          <Field label="Customer">
            <select
              name="customerId"
              required
              defaultValue={initial?.customerId}
            >
              <option value="">Select customer</option>
              {data.customers
                .filter((c) => c.active || c.id === initial?.customerId)
                .map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name} · {c.code}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Branch">
            <select
              name="branchId"
              required
              defaultValue={initial?.branchId || data.branches[0]?.id}
            >
              {data.branches
                .filter((b) => b.active || b.id === initial?.branchId)
                .map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <div className="route-fields">
          <Field label="POL">
            <PortSelect
              name="pol"
              ports={data.ports}
              initial={initial?.polId}
            />
          </Field>
          <Field label="Transshipment port">
            <PortSelect
              name="tp"
              ports={data.ports}
              initial={initial?.transshipmentPortId || ""}
              optional
            />
          </Field>
          <Field label="POD">
            <PortSelect
              name="pod"
              ports={data.ports}
              initial={initial?.podId}
            />
          </Field>
        </div>
        <div className="two">
          <Field label="Origin port">
            <input
              name="originPort"
              maxLength={160}
              defaultValue={initial?.originPort || ""}
            />
          </Field>
          <Field label="Place of delivery">
            <input
              name="placeOfDelivery"
              maxLength={200}
              defaultValue={initial?.placeOfDelivery || ""}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection
        title="Transport and references"
        note="Vessel, dates and documents"
      >
        <div className="three">
          <Field label="Mode">
            <select name="mode" defaultValue={initial?.transportMode || "SEA"}>
              {["SEA", "AIR", "ROAD", "MULTIMODAL"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={initial?.status || "DRAFT"}>
              {[
                "DRAFT",
                "OPEN",
                "COMPLETED",
                "READY_TO_INVOICE",
                "CANCELLED",
              ].map((v) => (
                <option value={v} key={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sailed date">
            <input
              name="sailedDate"
              type="date"
              defaultValue={initial?.sailedDate || ""}
            />
          </Field>
        </div>
        <div className="two">
          <Field label="Vessel">
            <input
              name="vessel"
              maxLength={160}
              defaultValue={initial?.vessel || ""}
            />
          </Field>
          <Field label="Voyage">
            <input
              name="voyage"
              maxLength={80}
              defaultValue={initial?.voyage || ""}
            />
          </Field>
          <Field label="Customer reference">
            <input
              name="customerReference"
              maxLength={120}
              defaultValue={initial?.customerReference || ""}
            />
          </Field>
          <Field label="Sales person">
            <input
              name="salesPerson"
              maxLength={160}
              defaultValue={initial?.salesPerson || ""}
            />
          </Field>
          <Field label="HBL">
            <input
              name="hbl"
              maxLength={100}
              defaultValue={initial?.hbl || ""}
            />
          </Field>
          <Field label="MBL">
            <input
              name="mbl"
              maxLength={100}
              defaultValue={initial?.mbl || ""}
            />
          </Field>
          <Field label="Customs document reference">
            <input
              name="customsDocReference"
              maxLength={160}
              defaultValue={initial?.customsDocReference || ""}
            />
          </Field>
          <Field label="Terms of shipment">
            <input
              name="shipmentTerms"
              maxLength={80}
              placeholder="PREPAID"
              defaultValue={initial?.shipmentTerms || ""}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection title="Parties" note="Shipment parties shown on the invoice">
        <div className="two">
          <Field label="Shipper">
            <input
              name="shipper"
              maxLength={200}
              defaultValue={initial?.shipper || ""}
            />
          </Field>
          <Field label="Consignee">
            <input
              name="consignee"
              maxLength={200}
              defaultValue={initial?.consignee || ""}
            />
          </Field>
          <Field label="Notify name">
            <input
              name="notifyName"
              maxLength={200}
              defaultValue={initial?.notifyName || ""}
            />
          </Field>
          <Field label="Commodity">
            <input
              name="commodity"
              maxLength={300}
              defaultValue={initial?.commodity || ""}
            />
          </Field>
        </div>
      </FormSection>
      <FormSection
        title="Cargo and equipment"
        note="Package totals and container plan"
      >
        <div className="three">
          <Field label="Package type / equipment">
            <select
              name="equipment"
              defaultValue={initial?.plannedContainerType || "20GP"}
            >
              {["20GP", "20SD", "40GP", "40HC", "45HC", "LCL"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Number of containers">
            <input
              name="count"
              type="number"
              min="1"
              max="999"
              defaultValue={initial?.plannedContainerCount || 1}
            />
          </Field>
          <Field label="No. of packages (PKGS)">
            <input
              name="packageCount"
              type="number"
              min="0"
              step="1"
              defaultValue={initial?.packageCount ?? ""}
            />
          </Field>
          <WeightField
            label="Weight"
            name="weightKg"
            unitName="weightUnit"
            defaultValue={initial?.weightKg}
          />
          <Field label="Volume (CBM)">
            <input
              name="volumeCbm"
              type="number"
              min="0"
              step="0.001"
              defaultValue={initial?.volumeCbm ?? ""}
            />
          </Field>
          <WeightField
            label="Chargeable weight"
            name="chargeableWeightKg"
            unitName="chargeableWeightUnit"
            defaultValue={initial?.chargeableWeightKg}
          />
        </div>
        <Field label="Container manifest">
          <textarea
            name="containerNumbers"
            rows={5}
            placeholder="DOLU2008497 / 20SD   CRXU3126290 / 20SD"
            defaultValue={initial?.containers
              .map((container) => container.containerNumber)
              .join("\n")}
            onInput={(event) => event.currentTarget.setCustomValidity("")}
          />
          <small className="input-help">
            {detectedContainers
              ? `${detectedContainers} unique container${detectedContainers === 1 ? "" : "s"} detected. `
              : ""}
            Paste or update the complete container list. Existing seal numbers
            are preserved for container numbers that remain in the list.
          </small>
        </Field>
      </FormSection>
      <FormSection title="Services required" note="Select one or more services">
        <div className="service-picker-head">
          <div>
            <b>Job services</b>
            <small>
              Click a service card to select it. Charges are entered after
              saving the job.
            </small>
          </div>
          <span>{serviceIds.length} selected</span>
        </div>
        <div className="service-picker">
          {data.services
            .filter((s) => s.active || serviceIds.includes(s.id))
            .map((s) => {
              const selected = serviceIds.includes(s.id);
              return (
                <button
                  type="button"
                  aria-pressed={selected}
                  className={
                    selected ? "service-choice selected" : "service-choice"
                  }
                  key={s.id}
                  onClick={() => toggleService(s.id, !selected)}
                >
                  <i>{selected ? "✓" : "+"}</i>
                  <span>
                    <b>{s.name}</b>
                    <small>
                      {s.code} · Charged per {s.defaultUom}
                    </small>
                  </span>
                </button>
              );
            })}
        </div>
      </FormSection>
      {!serviceIds.length && (
        <p className="form-help validation-help">
          Select at least one service to continue.
        </p>
      )}
      <FormButtons
        label={initial ? "Update job" : "Create job"}
        close={close}
        disabled={!serviceIds.length}
      />
    </form>
  );
  return initial ? (
    <Modal title={`Edit ${initial.jobNumber}`} wide close={close}>
      {form}
    </Modal>
  ) : (
    <section className="panel job-form-page">
      <div className="job-page-intro">
        <div>
          <h2>New logistics job</h2>
          <p>
            Complete the shipment details below. Your browser draft remains
            available if the page refreshes.
          </p>
        </div>
        <span className="tag amber">DRAFT</span>
      </div>
      {form}
    </section>
  );
}

function ContainerDialog({
  close,
  save,
}: {
  close(): void;
  save(v: {
    containerNumber: string;
    size: "20" | "40" | "45";
    containerType: string;
    sealNumber: string | null;
  }): void;
}) {
  return (
    <Modal title="Add actual container" close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const d = new FormData(event.currentTarget);
          save({
            containerNumber: String(d.get("number")).toUpperCase(),
            size: String(d.get("size")) as "20" | "40" | "45",
            containerType: String(d.get("type")),
            sealNumber: nullable(d, "seal"),
          });
        }}
      >
        <Field label="Container number">
          <input
            name="number"
            required
            maxLength={64}
            placeholder="Enter the container reference"
          />
          <small className="input-help">Any carrier container reference is accepted.</small>
        </Field>
        <div className="two">
          <Field label="Size">
            <select name="size">
              <option>20</option>
              <option>40</option>
              <option>45</option>
            </select>
          </Field>
          <Field label="Type">
            <select name="type">
              <option>GP</option>
              <option>HC</option>
              <option>RF</option>
              <option>OT</option>
              <option>FR</option>
            </select>
          </Field>
        </div>
        <Field label="Seal number">
          <input name="seal" />
        </Field>
        <FormButtons label="Add container" close={close} />
      </form>
    </Modal>
  );
}

function ChargeDialog({
  item,
  taxes,
  currencies,
  close,
  save,
}: {
  item: { service: AssignedService; charge?: Charge };
  taxes: MasterData["taxRates"];
  currencies: string[];
  close(): void;
  save(v: {
    jobServiceId: string;
    description: string;
    quantity: string;
    uom: string;
    currency: "AED" | "USD";
    exchangeRate: string;
    unitRate: string;
    taxRateId: string;
  }): void;
}) {
  const supportedCurrencies = currencies.filter(
    (value): value is ChargeCurrency => value === "AED" || value === "USD",
  );
  const [currency, setCurrency] = useState<ChargeCurrency>(
    (item.charge?.currency ?? "USD") as ChargeCurrency,
  );
  const [quantity, setQuantity] = useState(item.charge?.quantity || "1");
  const [unitRate, setUnitRate] = useState(item.charge?.unitRate || "");
  const [exchangeRate, setExchangeRate] = useState(
    item.charge
      ? item.charge.currency === "USD"
        ? item.charge.exchangeRate
        : "1"
      : "3.685",
  );
  const [taxId, setTaxId] = useState(
    taxes.find((t) => t.rate === item.charge?.taxRate)?.id ||
      taxes[0]?.id ||
      "",
  );
  const taxRate = Number(taxes.find((t) => t.id === taxId)?.rate || 0);
  const amounts = chargeAmounts(
    Number(quantity) || 0,
    Number(unitRate) || 0,
    currency === "AED" ? 1 : Number(exchangeRate) || 0,
    taxRate,
  );
  const changeCurrency = (value: ChargeCurrency) => {
    setCurrency(value);
    setExchangeRate(
      value === "AED"
        ? "1"
        : item.charge?.currency === "USD"
          ? item.charge.exchangeRate
          : "3.685",
    );
  };
  return (
    <Modal
      title={item.charge ? "Edit job charge" : "Add job charge"}
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const d = new FormData(event.currentTarget);
          save({
            jobServiceId: item.service.jobServiceId,
            description: String(d.get("description")),
            quantity,
            uom: String(d.get("uom")),
            currency,
            exchangeRate: currency === "AED" ? "1" : exchangeRate,
            unitRate,
            taxRateId: taxId,
          });
        }}
      >
        <Field label="Service">
          <input value={item.service.name} readOnly />
        </Field>
        <Field label="Description">
          <input
            name="description"
            required
            defaultValue={item.charge?.description || item.service.name}
          />
        </Field>
        <div className="two">
          <Field label="Quantity">
            <input
              name="quantity"
              required
              type="number"
              min="0.001"
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field label="Unit">
            <input
              name="uom"
              required
              list="charge-units"
              readOnly={item.service.code.toUpperCase() === "OCEAN"}
              defaultValue={item.service.code.toUpperCase() === "OCEAN" ? "CNT" : item.charge?.uom || item.service.defaultUom}
            />
            <datalist id="charge-units">
              <option value="CNT" />
              <option value="CNTR" />
              <option value="JOB" />
              <option value="PCS" />
              <option value="PKG" />
            </datalist>
          </Field>
        </div>
        <div className="three">
          <Field label="Currency">
            <select
              name="currency"
              value={currency}
              onChange={(event) =>
                changeCurrency(event.target.value as ChargeCurrency)
              }
            >
              {(supportedCurrencies.length
                ? supportedCurrencies
                : (["AED", "USD"] as ChargeCurrency[])
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label={`Rate (${currency})`}>
            <input
              name="rate"
              required
              type="number"
              min="0"
              step="0.01"
              value={unitRate}
              onChange={(event) => setUnitRate(event.target.value)}
            />
          </Field>
          <Field label="AED exchange rate">
            <input
              name="exchangeRate"
              required
              type="number"
              min="0.00000001"
              step="0.00000001"
              value={currency === "AED" ? "1" : exchangeRate}
              disabled={currency === "AED"}
              onChange={(event) => setExchangeRate(event.target.value)}
            />
            <small className="input-help">
              AED received for 1 {currency}. Confirm the agreed rate before
              saving.
            </small>
          </Field>
        </div>
        <Field label="VAT">
          <select
            name="tax"
            value={taxId}
            onChange={(event) => setTaxId(event.target.value)}
          >
            {taxes.map((t) => (
              <option value={t.id} key={t.id}>
                {t.code} · {t.rate}%
              </option>
            ))}
          </select>
        </Field>
        <div className="charge-preview">
          <span>
            <small>Charge amount</small>
            <b>{formatChargeRate(currency, amounts.foreignAmount)}</b>
          </span>
          <span>
            <small>Converted amount</small>
            <b>{money.format(amounts.netAed)}</b>
          </span>
          <span>
            <small>VAT</small>
            <b>{money.format(amounts.vatAed)}</b>
          </span>
          <span>
            <small>Total in AED</small>
            <b>{money.format(amounts.totalAed)}</b>
          </span>
        </div>
        {item.charge?.invoiceStatus === "DRAFT" && (
          <p className="form-help">
            This charge is on a draft invoice. Saving will update that draft and
            recalculate its AED totals.
          </p>
        )}
        <FormButtons
          label={item.charge ? "Update charge" : "Save charge"}
          close={close}
        />
      </form>
    </Modal>
  );
}

function InvoiceDialog({
  charges,
  containerCount,
  oceanServiceIds,
  close,
  save,
}: {
  charges: Charge[];
  containerCount: number;
  oceanServiceIds: string[];
  close(): void;
  save(ids: string[]): void;
}) {
  const [ids, setIds] = useState(charges.map((c) => c.id));
  const total = charges
    .filter((c) => ids.includes(c.id))
    .reduce((sum, c) => {
      const quantity = oceanServiceIds.includes(c.serviceId) ? containerCount : Number(c.quantity);
      return sum + chargeAmounts(quantity, Number(c.unitRate), Number(c.exchangeRate), Number(c.taxRate)).totalAed;
    }, 0);
  return (
    <Modal title="Create draft invoice" close={close}>
      <form
        className="invoice-draft-form"
        onSubmit={(event) => {
          event.preventDefault();
          save(ids);
        }}
      >
        <p className="muted">
          Select the unbilled charges to snapshot into this draft.
        </p>
        <div className="review-lines">
          {charges.map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={ids.includes(c.id)}
                onChange={(event) =>
                  setIds((current) =>
                    event.target.checked
                      ? [...current, c.id]
                      : current.filter((id) => id !== c.id),
                  )
                }
              />
              <span>
                {c.serviceName}
                <small>
                  {oceanServiceIds.includes(c.serviceId) ? containerCount : c.quantity} {oceanServiceIds.includes(c.serviceId) ? "CNT" : c.uom} × {formatChargeRate(c.currency, c.unitRate)}
                </small>
              </span>
              <b>{money.format(chargeAmounts(
                oceanServiceIds.includes(c.serviceId) ? containerCount : Number(c.quantity),
                Number(c.unitRate), Number(c.exchangeRate), Number(c.taxRate),
              ).totalAed)}</b>
            </label>
          ))}
        </div>
        <div className="dialog-total">
          <span>Selected total</span>
          <b>{money.format(total)}</b>
        </div>
        <div className="form-actions">
          <button type="button" className="soft" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={!ids.length}>
            Create draft
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InvoiceEditDialog({
  invoice,
  customers,
  taxes,
  close,
  save,
}: {
  invoice: Invoice;
  customers: Customer[];
  taxes: MasterData["taxRates"];
  close(): void;
  save(value: UpdateInvoice): void;
}) {
  const [lines, setLines] = useState(
    invoice.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: line.quantity,
      uom: line.serviceCode.toUpperCase() === "OCEAN" ? "CNT" : line.uom,
      currency: line.currency as "AED" | "USD",
      exchangeRate: line.exchangeRate,
      unitRate: line.unitRate,
      taxRateId:
        taxes.find(
          (tax) => tax.code === line.taxCode && tax.rate === line.taxRate,
        )?.id || taxes[0]?.id || "",
    })),
  );
  const matchingCustomer = customers.find(
    (customer) =>
      customer.name === invoice.customerName &&
      (customer.trn || null) === (invoice.customerTrn || null),
  );
  const [customerId, setCustomerId] = useState(matchingCustomer?.id || "");
  const [customerName, setCustomerName] = useState(invoice.customerName);
  const [customerTrn, setCustomerTrn] = useState(invoice.customerTrn || "");
  const [customerVatNumber, setCustomerVatNumber] = useState(
    invoice.customerVatNumber || "",
  );
  const [customerAddress, setCustomerAddress] = useState(
    invoice.customerAddress || "",
  );
  const [paymentStatus, setPaymentStatus] = useState(invoice.paymentStatus);
  const [paymentDate, setPaymentDate] = useState(invoice.paymentDate || "");
  const [containers, setContainers] = useState(invoice.containers);
  const selectCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    setCustomerName(customer.name);
    setCustomerTrn(customer.trn || "");
    setCustomerVatNumber(customer.vatNumber || "");
    setCustomerAddress(customer.billingAddress || "");
  };
  const updateLine = (
    index: number,
    field: keyof (typeof lines)[number],
    value: string,
  ) =>
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? {
              ...line,
              [field]: value,
              ...(field === "currency" && value === "AED"
                ? { exchangeRate: "1" }
                : {}),
            }
          : line,
      ),
    );
  const updateContainer = <K extends keyof Invoice["containers"][number]>(
    index: number,
    field: K,
    value: Invoice["containers"][number][K],
  ) =>
    setContainers((current) =>
      current.map((container, containerIndex) =>
        containerIndex === index ? { ...container, [field]: value } : container,
      ),
    );
  return (
    <Modal
      title={`Edit ${invoice.invoiceNumber || invoice.draftReference}`}
      wide
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const weightMt = nullableNumber(data, "weightMt");
          const chargeableWeightMt = nullableNumber(data, "chargeableWeightMt");
          save({
            invoiceDate: String(data.get("invoiceDate")),
            dueDate: nullable(data, "dueDate"),
            paymentDate: paymentStatus === "PAID" ? paymentDate : null,
            customerName,
            customerTrn: customerTrn.trim() || null,
            customerVatNumber: customerVatNumber.trim() || null,
            customerAddress: customerAddress.trim() || null,
            transportMode: String(data.get("transportMode")) as Invoice["transportMode"],
            polName: String(data.get("polName")),
            podName: String(data.get("podName")),
            transshipmentPortName: nullable(data, "transshipmentPortName"),
            vessel: nullable(data, "vessel"),
            voyage: nullable(data, "voyage"),
            sailedDate: nullable(data, "sailedDate"),
            originPort: nullable(data, "originPort"),
            placeOfDelivery: nullable(data, "placeOfDelivery"),
            shipper: nullable(data, "shipper"),
            consignee: nullable(data, "consignee"),
            notifyName: nullable(data, "notifyName"),
            commodity: nullable(data, "commodity"),
            salesPerson: nullable(data, "salesPerson"),
            customerReference: nullable(data, "customerReference"),
            packageCount: nullableNumber(data, "packageCount"),
            weightKg: weightMt === null ? null : weightMt * 1000,
            volumeCbm: nullableNumber(data, "volumeCbm"),
            chargeableWeightKg:
              chargeableWeightMt === null ? null : chargeableWeightMt * 1000,
            customsDocReference: nullable(data, "customsDocReference"),
            shipmentTerms: nullable(data, "shipmentTerms"),
            hbl: nullable(data, "hbl"),
            mbl: nullable(data, "mbl"),
            plannedContainerType: String(data.get("plannedContainerType")),
            plannedContainerCount: Number(data.get("plannedContainerCount")),
            containers,
            remarks: nullable(data, "remarks"),
            lines,
          });
        }}
      >
        <p className="form-help">
          The invoice number and {invoice.status.toLowerCase()} status remain unchanged. Every revision is audit logged.
        </p>
        <div className="three">
          <Field label="Invoice date">
            <input
              name="invoiceDate"
              type="date"
              required
              defaultValue={invoice.invoiceDate || new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Due date">
            <input name="dueDate" type="date" defaultValue={invoice.dueDate || ""} />
          </Field>
          <Field label="Payment status">
            <select
              value={paymentStatus}
              disabled={invoice.status !== "ISSUED"}
              onChange={(event) => {
                const status = event.target.value as Invoice["paymentStatus"];
                setPaymentStatus(status);
                setPaymentDate(
                  status === "PAID"
                    ? paymentDate || new Date().toISOString().slice(0, 10)
                    : "",
                );
              }}
            >
              <option value="UNPAID">UNPAID</option>
              <option value="PAID">PAID</option>
            </select>
          </Field>
        </div>
        {paymentStatus === "PAID" && (
          <Field label="Payment date">
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </Field>
        )}
        <Field label="Select billing customer">
          <select value={customerId} onChange={(event) => selectCustomer(event.target.value)}>
            <option value="">Use custom invoice details</option>
            {customers
              .filter((customer) => customer.active || customer.id === customerId)
              .map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} · {customer.code}
                </option>
              ))}
          </select>
          <small className="input-help">
            Selecting a customer fills its name, tax details and billing address. You can still revise the copied details below.
          </small>
        </Field>
        <Field label="Bill to">
          <input
            name="customerName"
            required
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </Field>
        <div className="two">
          <Field label="TRN number">
            <input name="customerTrn" maxLength={32} value={customerTrn} onChange={(event) => setCustomerTrn(event.target.value)} />
          </Field>
          <Field label="VAT number">
            <input name="customerVatNumber" maxLength={32} value={customerVatNumber} onChange={(event) => setCustomerVatNumber(event.target.value)} />
          </Field>
        </div>
        <Field label="Billing address">
          <textarea name="customerAddress" rows={3} value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} />
        </Field>
        <FormSection title="Shipment details" note="These values appear on this invoice only">
          <div className="three">
            <Field label="Transport mode">
              <select name="transportMode" defaultValue={invoice.transportMode}>
                <option>SEA</option><option>AIR</option><option>ROAD</option><option>MULTIMODAL</option>
              </select>
            </Field>
            <Field label="Vessel"><input name="vessel" maxLength={160} defaultValue={invoice.vessel || ""} /></Field>
            <Field label="Voyage"><input name="voyage" maxLength={80} defaultValue={invoice.voyage || ""} /></Field>
          </div>
          <div className="three">
            <Field label="Port of loading (POL)"><input name="polName" required maxLength={160} defaultValue={invoice.polName} /></Field>
            <Field label="Transshipment port"><input name="transshipmentPortName" maxLength={160} defaultValue={invoice.transshipmentPortName || ""} /></Field>
            <Field label="Port of discharge (POD)"><input name="podName" required maxLength={160} defaultValue={invoice.podName} /></Field>
          </div>
          <div className="three">
            <Field label="Sailed date"><input name="sailedDate" type="date" defaultValue={invoice.sailedDate || ""} /></Field>
            <Field label="Origin port"><input name="originPort" maxLength={160} defaultValue={invoice.originPort || ""} /></Field>
            <Field label="Place of delivery"><input name="placeOfDelivery" maxLength={200} defaultValue={invoice.placeOfDelivery || ""} /></Field>
          </div>
          <div className="three">
            <Field label="Shipper"><input name="shipper" maxLength={200} defaultValue={invoice.shipper || ""} /></Field>
            <Field label="Consignee"><input name="consignee" maxLength={200} defaultValue={invoice.consignee || ""} /></Field>
            <Field label="Notify name"><input name="notifyName" maxLength={200} defaultValue={invoice.notifyName || ""} /></Field>
          </div>
          <div className="three">
            <Field label="Commodity"><input name="commodity" maxLength={300} defaultValue={invoice.commodity || ""} /></Field>
            <Field label="Sales person"><input name="salesPerson" maxLength={160} defaultValue={invoice.salesPerson || ""} /></Field>
            <Field label="Customer reference"><input name="customerReference" maxLength={120} defaultValue={invoice.customerReference || ""} /></Field>
          </div>
          <div className="three">
            <Field label="HBL"><input name="hbl" maxLength={100} defaultValue={invoice.hbl || ""} /></Field>
            <Field label="MBL"><input name="mbl" maxLength={100} defaultValue={invoice.mbl || ""} /></Field>
            <Field label="Customs document reference"><input name="customsDocReference" maxLength={160} defaultValue={invoice.customsDocReference || ""} /></Field>
          </div>
        </FormSection>
        <FormSection title="Cargo and equipment" note="Weights are entered and printed in metric tonnes">
          <div className="three">
            <Field label="Package type / equipment"><input name="plannedContainerType" required maxLength={24} defaultValue={invoice.plannedContainerType} /></Field>
            <Field label="No. of packages"><input name="packageCount" type="number" min="0" step="1" defaultValue={invoice.packageCount ?? ""} /></Field>
            <Field label="Terms of shipment"><input name="shipmentTerms" maxLength={80} defaultValue={invoice.shipmentTerms || ""} /></Field>
          </div>
          <div className="three">
            <Field label="Weight (MT)"><input name="weightMt" type="number" min="0" step="0.001" defaultValue={invoice.weightKg === null ? "" : invoice.weightKg / 1000} /></Field>
            <Field label="Volume (CBM)"><input name="volumeCbm" type="number" min="0" step="0.001" defaultValue={invoice.volumeCbm ?? ""} /></Field>
            <Field label="Chargeable weight (MT)"><input name="chargeableWeightMt" type="number" min="0" step="0.001" defaultValue={invoice.chargeableWeightKg === null ? "" : invoice.chargeableWeightKg / 1000} /></Field>
          </div>
          <Field label="Planned container count">
            <input name="plannedContainerCount" required type="number" min={Math.max(1, containers.length)} max="999" step="1" defaultValue={invoice.plannedContainerCount} />
          </Field>
          <div className="invoice-container-editor">
            <div className="section-heading">
              <div><h3>Container list</h3><p>Edit the container number, size, type, or seal shown on this invoice.</p></div>
              <button
                type="button"
                className="soft compact"
                onClick={() => setContainers((current) => [...current, { id: crypto.randomUUID(), containerNumber: "", size: "20", containerType: "GP", sealNumber: null }])}
              >
                + Add container
              </button>
            </div>
            {containers.map((container, index) => (
              <div className="invoice-container-row" key={container.id}>
                <Field label="Container number"><input required maxLength={64} value={container.containerNumber} onChange={(event) => updateContainer(index, "containerNumber", event.target.value.toUpperCase())} /></Field>
                <Field label="Size"><select value={container.size} onChange={(event) => updateContainer(index, "size", event.target.value as "20" | "40" | "45")}><option>20</option><option>40</option><option>45</option></select></Field>
                <Field label="Type"><input required maxLength={24} value={container.containerType} onChange={(event) => updateContainer(index, "containerType", event.target.value)} /></Field>
                <Field label="Seal number"><input maxLength={64} value={container.sealNumber || ""} onChange={(event) => updateContainer(index, "sealNumber", event.target.value || null)} /></Field>
                <button type="button" className="danger-link" onClick={() => setContainers((current) => current.filter((_, containerIndex) => containerIndex !== index))}>Remove</button>
              </div>
            ))}
            {!containers.length && <p className="empty-inline">No containers are listed on this invoice.</p>}
          </div>
        </FormSection>
        <div className="invoice-edit-lines">
          <h3>Invoice charges</h3>
          {lines.map((line, index) => {
            const tax = taxes.find((item) => item.id === line.taxRateId);
            const amounts = chargeAmounts(
              Number(line.quantity),
              Number(line.unitRate),
              Number(line.exchangeRate),
              Number(tax?.rate || 0),
            );
            return (
              <section className="invoice-edit-line" key={line.id}>
                <b>{invoice.lines[index]?.serviceName}</b>
                <Field label="Description">
                  <input required value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} />
                </Field>
                <div className="invoice-line-fields">
                  <Field label="Quantity">
                    <input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} />
                  </Field>
                  <Field label="Unit">
                    <input required maxLength={16} readOnly={invoice.lines[index]?.serviceCode.toUpperCase() === "OCEAN"} value={line.uom} onChange={(event) => updateLine(index, "uom", event.target.value)} />
                  </Field>
                  <Field label="Currency">
                    <select value={line.currency} onChange={(event) => updateLine(index, "currency", event.target.value)}><option>AED</option><option>USD</option></select>
                  </Field>
                  <Field label={`Rate (${line.currency})`}>
                    <input required type="number" min="0" step="0.01" value={line.unitRate} onChange={(event) => updateLine(index, "unitRate", event.target.value)} />
                  </Field>
                  <Field label="AED exchange rate">
                    <input required type="number" min="0.00000001" step="0.00000001" disabled={line.currency === "AED"} value={line.currency === "AED" ? "1" : line.exchangeRate} onChange={(event) => updateLine(index, "exchangeRate", event.target.value)} />
                  </Field>
                  <Field label="VAT">
                    <select required value={line.taxRateId} onChange={(event) => updateLine(index, "taxRateId", event.target.value)}>{taxes.map((item) => <option key={item.id} value={item.id}>{item.rate}%</option>)}</select>
                  </Field>
                </div>
                <small className="input-help">Revised total: {money.format(amounts.totalAed)}</small>
              </section>
            );
          })}
        </div>
        <Field label="Additional remarks">
          <textarea name="remarks" rows={3} maxLength={1500} defaultValue={invoice.remarks || ""} />
        </Field>
        <FormButtons label="Save invoice revision" close={close} />
      </form>
    </Modal>
  );
}

function PortDialog({
  initial,
  close,
  save,
}: {
  initial: Port | null;
  close(): void;
  save(v: {
    unLocode: string | null;
    name: string;
    countryCode: string;
    active: boolean;
  }): void;
}) {
  return (
    <Modal title={initial ? "Edit port" : "Add company port"} close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const d = new FormData(event.currentTarget);
          save({
            unLocode: nullable(d, "locode")?.toUpperCase() || null,
            name: String(d.get("name")),
            countryCode: String(d.get("country")).toUpperCase(),
            active: initial?.active ?? true,
          });
        }}
      >
        <Field label="Port name">
          <input name="name" required defaultValue={initial?.name} />
        </Field>
        <div className="two">
          <Field label="UN/LOCODE">
            <input
              name="locode"
              pattern="[A-Za-z]{2}[A-Za-z0-9]{3}"
              placeholder="AEJEA"
              defaultValue={initial?.unLocode || ""}
            />
          </Field>
          <Field label="Country code">
            <input
              name="country"
              required
              pattern="[A-Za-z]{2}"
              placeholder="AE"
              defaultValue={initial?.countryCode}
            />
          </Field>
        </div>
        <FormButtons label="Save port" close={close} />
      </form>
    </Modal>
  );
}

function ServiceDialog({
  initial,
  data,
  close,
  save,
}: {
  initial: MasterData["services"][number] | null;
  data: MasterData;
  close(): void;
  save(v: {
    code: string;
    name: string;
    defaultUom: string;
    defaultCurrency: string;
    defaultTaxRateId: string;
    active: boolean;
  }): void;
}) {
  return (
    <Modal title={initial ? "Edit service" : "Add service"} close={close}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const d = new FormData(event.currentTarget);
          save({
            code: String(d.get("code")).toUpperCase(),
            name: String(d.get("name")),
            defaultUom: String(d.get("uom")).toUpperCase(),
            defaultCurrency: String(d.get("currency")),
            defaultTaxRateId: String(d.get("tax")),
            active: initial?.active ?? true,
          });
        }}
      >
        <div className="two">
          <Field label="Service code">
            <input name="code" required defaultValue={initial?.code} />
          </Field>
          <Field label="Service name">
            <input name="name" required defaultValue={initial?.name} />
          </Field>
        </div>
        <div className="three">
          <Field label="Default unit">
            <input
              name="uom"
              required
              defaultValue={initial?.defaultUom || "JOB"}
            />
          </Field>
          <Field label="Currency">
            <select
              name="currency"
              defaultValue={initial?.defaultCurrency || "USD"}
            >
              {data.currencies.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="VAT">
            <select name="tax" defaultValue={initial?.defaultTaxRateId}>
              {data.taxRates.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.code} · {t.rate}%
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="form-help">
          Every job keeps its own agreed charge; this stores entry defaults
          only.
        </p>
        <FormButtons label="Save service" close={close} />
      </form>
    </Modal>
  );
}

function BranchDialog({ initial, close, save }: { initial: MasterData["branches"][number] | null; close(): void; save(value: SaveBranch): void }) {
  return <Modal title={initial ? "Edit branch" : "Add branch"} close={close}>
    <form onSubmit={(event) => { event.preventDefault(); const d = new FormData(event.currentTarget); save({ code: String(d.get("code")).toUpperCase(), name: String(d.get("name")), emirate: String(d.get("emirate")), address: nullable(d, "address"), trn: nullable(d, "trn"), active: initial?.active ?? true }); }}>
      <div className="two"><Field label="Branch code"><input name="code" required defaultValue={initial?.code}/></Field><Field label="Branch name"><input name="name" required defaultValue={initial?.name}/></Field></div>
      <Field label="Emirate"><input name="emirate" required defaultValue={initial?.emirate}/></Field>
      <Field label="TRN (optional)"><input name="trn" defaultValue={initial?.trn || ""}/></Field>
      <Field label="Address (optional)"><textarea name="address" rows={3} defaultValue={initial?.address || ""}/></Field>
      <FormButtons label="Save branch" close={close}/>
    </form>
  </Modal>;
}

function TaxRateDialog({ initial, close, save }: { initial: MasterData["taxRates"][number] | null; close(): void; save(value: SaveTaxRate): void }) {
  return <Modal title={initial ? "Edit tax rate" : "Add tax rate"} close={close}>
    <form onSubmit={(event) => { event.preventDefault(); const d = new FormData(event.currentTarget); save({ code: String(d.get("code")).toUpperCase(), category: String(d.get("category")) as SaveTaxRate["category"], rate: Number(d.get("rate")), effectiveFrom: String(d.get("effectiveFrom")), effectiveTo: nullable(d, "effectiveTo") }); }}>
      <div className="two"><Field label="Tax code"><input name="code" required defaultValue={initial?.code}/></Field><Field label="Rate (%)"><input name="rate" required type="number" min="0" max="100" step="0.01" defaultValue={initial?.rate}/></Field></div>
      <Field label="Category"><select name="category" defaultValue={initial?.category || "STANDARD"}><option value="STANDARD">Standard</option><option value="ZERO_RATED">Zero rated</option><option value="EXEMPT">Exempt</option><option value="OUT_OF_SCOPE">Out of scope</option></select></Field>
      <div className="two"><Field label="Effective from"><input name="effectiveFrom" required type="date" defaultValue={initial?.effectiveFrom || new Date().toISOString().slice(0,10)}/></Field><Field label="Effective to (optional)"><input name="effectiveTo" type="date" min={initial?.effectiveFrom} defaultValue={initial?.effectiveTo || ""}/></Field></div>
      <p className="form-help">Issued invoices keep their saved tax values. This default applies to future charges.</p>
      <FormButtons label="Save tax rate" close={close}/>
    </form>
  </Modal>;
}

function UserDialog({
  initial,
  canAssignOwner,
  close,
  save,
}: {
  initial: ManagedUser | null;
  canAssignOwner: boolean;
  close(): void;
  save(value: CreateManagedUser | UpdateManagedUser): void;
}) {
  const roles = (
    canAssignOwner
      ? ["OWNER", "ADMIN", "OPERATIONS", "FINANCE", "VIEWER"]
      : ["ADMIN", "OPERATIONS", "FINANCE", "VIEWER"]
  ) as ManagedUser["role"][];
  return (
    <Modal
      title={initial ? "Edit portal user" : "Add portal user"}
      close={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const d = new FormData(event.currentTarget);
          if (initial)
            save({
              name: String(d.get("name")),
              role: String(d.get("role")) as ManagedUser["role"],
            });
          else
            save({
              name: String(d.get("name")),
              email: String(d.get("email")),
              role: String(d.get("role")) as ManagedUser["role"],
              temporaryPassword: String(d.get("password")),
            });
        }}
      >
        <Field label="Full name">
          <input
            name="name"
            required
            minLength={2}
            defaultValue={initial?.name}
          />
        </Field>
        <Field label="Email">
          <input
            name="email"
            type="email"
            required={!initial}
            disabled={Boolean(initial)}
            defaultValue={initial?.email}
          />
        </Field>
        <Field label="Role">
          <select name="role" defaultValue={initial?.role || "OPERATIONS"}>
            {roles.map((role) => (
              <option key={role} value={role}>
                {label(role)}
              </option>
            ))}
          </select>
        </Field>
        {!initial && (
          <Field label="Temporary password">
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
            <small className="input-help">
              Use at least 12 characters. If this email already exists in
              Supabase, its current password is kept and the account is linked
              to this company.
            </small>
          </Field>
        )}
        <div className="role-guide">
          <b>Role access</b>
          <small>
            Owner: full control including owner access · Admin/Operations: users,
            operations, billing and setup · Finance: job charges and invoices · Viewer: read only
          </small>
        </div>
        <FormButtons
          label={initial ? "Update user" : "Create account"}
          close={close}
        />
      </form>
    </Modal>
  );
}

const printAmount = (value: string | number) =>
  Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const printDate = (value: string | null) =>
  value
    ? new Date(`${value.slice(0, 10)}T00:00:00`)
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .replaceAll(" ", "-")
    : "—";
function PersistedPrint({ invoice }: { invoice: Invoice }) {
  const containerText =
    invoice.containers
      .map((c) => `${c.containerNumber} / ${c.size}${c.containerType}`)
      .join("  ") || "—";
  const taxGroups = Array.from(
    invoice.lines
      .reduce((map, line) => {
        const key = `${line.taxCode}|${line.taxRate}`;
        const item = map.get(key) || {
          code: line.taxCode,
          rate: line.taxRate,
          taxable: 0,
          vat: 0,
        };
        item.taxable += Number(line.netAmount);
        item.vat += Number(line.vatAmount);
        map.set(key, item);
        return map;
      }, new Map<string, { code: string; rate: string; taxable: number; vat: number }>())
      .values(),
  );
  return (
    <article className="print-invoice" aria-hidden="true">
      <header className="invoice-brand">
        <div className="invoice-logo">
          <img
            src="/images/tsw-logo.png"
            alt="TransWave Shipping and Logistics"
          />
        </div>
        <strong>ORIGINAL FOR RECIPIENT</strong>
      </header>
      <h1 className="invoice-title">Tax Invoice</h1>
      <div className="party-grid">
        <section>
          <b>{invoice.companyName}</b>
          <p>{invoice.companyAddress || "—"}</p>
          <dl>
            <dt>Office VAT ID (TRN):</dt>
            <dd>{invoice.companyTrn || "—"}</dd>
            <dt>Invoice Ref:</dt>
            <dd>{invoice.invoiceNumber || invoice.draftReference}</dd>
            <dt>Invoice Date:</dt>
            <dd>{printDate(invoice.invoiceDate)}</dd>
          </dl>
        </section>
        <section>
          <h2>Bill To</h2>
          <b>{invoice.customerName}</b>
          <p>{invoice.customerAddress || "—"}</p>
          <dl>
            <dt>Region</dt>
            <dd>{invoice.branchName}</dd>
            <dt>TRN</dt>
            <dd>{invoice.customerTrn || "—"}</dd>
            <dt>VAT ID</dt>
            <dd>{invoice.customerVatNumber || "—"}</dd>
            <dt>Place of Supply</dt>
            <dd>{invoice.branchName}</dd>
            <dt>Due Date</dt>
            <dd>{invoice.dueDate ? printDate(invoice.dueDate) : ""}</dd>
          </dl>
        </section>
      </div>
      <h2 className="section-bar">
        Shipment Details For{" "}
        <span>
          {invoice.transportMode === "SEA"
            ? "LINER - FREIGHT SERVICE"
            : invoice.transportMode}
        </span>
      </h2>
      <div className="shipment-grid">
        <dl>
          <dt>Vessel/Voyage</dt>
          <dd>
            {[invoice.vessel, invoice.voyage].filter(Boolean).join("/") || "—"}
          </dd>
          <dt>Sailed Date</dt>
          <dd>{printDate(invoice.sailedDate)}</dd>
          <dt>Port of Loading</dt>
          <dd>{invoice.polName}</dd>
          <dt>Port of Discharge</dt>
          <dd>{invoice.podName}</dd>
          <dt>Origin Port</dt>
          <dd>{invoice.originPort || "—"}</dd>
          <dt>Place of Delivery</dt>
          <dd>{invoice.placeOfDelivery || "—"}</dd>
          <dt>Shipper</dt>
          <dd>{invoice.shipper || "—"}</dd>
          <dt>Consignee</dt>
          <dd>{invoice.consignee || "—"}</dd>
          <dt>Notify Name</dt>
          <dd>{invoice.notifyName || "—"}</dd>
          <dt>Commodity</dt>
          <dd>{invoice.commodity || "—"}</dd>
          <dt>Sales Person</dt>
          <dd>{invoice.salesPerson || "—"}</dd>
          <dt>Container No.</dt>
          <dd className="container-manifest">{containerText}</dd>
        </dl>
        <dl>
          <dt>Job Ref</dt>
          <dd>{invoice.jobNumber}</dd>
          <dt>Customer Ref</dt>
          <dd>{invoice.customerReference || "—"}</dd>
          <dt>Package Type</dt>
          <dd>{invoice.plannedContainerType}</dd>
          <dt>No. of Packages</dt>
          <dd>{invoice.packageCount === null ? "—" : `${invoice.packageCount} PKGS`}</dd>
          <dt>HBL</dt>
          <dd>{invoice.hbl || "—"}</dd>
          <dt>MBL</dt>
          <dd>{invoice.mbl || "—"}</dd>
          <dt>Weight (MT)</dt>
          <dd>{invoice.weightKg === null ? "—" : metricTonnes(invoice.weightKg)}</dd>
          <dt>Volume (CBM)</dt>
          <dd>{invoice.volumeCbm ?? "—"}</dd>
          <dt>Chargeable Weight (MT)</dt>
          <dd>{invoice.chargeableWeightKg === null ? "—" : metricTonnes(invoice.chargeableWeightKg)}</dd>
          <dt>Customs Doc Ref</dt>
          <dd>{invoice.customsDocReference || "—"}</dd>
          <dt>Terms of Shipment</dt>
          <dd>
            {invoice.shipmentTerms ||
              (invoice.paymentTermsDays === 0
                ? "PREPAID"
                : `${invoice.paymentTermsDays} DAYS`)}
          </dd>
          <dt>Equipment</dt>
          <dd>
            {invoice.plannedContainerCount} × {invoice.plannedContainerType}
          </dd>
        </dl>
      </div>
      <table className="invoice-charge-grid">
        <thead>
          <tr>
            <th>Description of Service</th>
            <th>Qty/UOM</th>
            <th>Rate</th>
            <th>
              Curr./
              <br />
              Ex.Rate
            </th>
            <th>
              Invoice
              <br />
              Amount (FC)
            </th>
            <th>
              Invoice
              <br />
              Amount (AED)
            </th>
            <th>
              Taxable
              <br />
              Value
            </th>
            <th>VAT Group</th>
            <th>
              VAT
              <br />
              Rate
            </th>
            <th>
              VAT
              <br />
              Amt.
            </th>
            <th>
              Total Amount
              <br />
              (AED)
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, index) => (
            <tr key={line.id}>
              <td>
                {index + 1}) {line.description}
              </td>
              <td>
                {line.quantity}/{line.uom}
              </td>
              <td>{printAmount(line.unitRate)}</td>
              <td>
                {line.currency}
                <br />
                {line.exchangeRate}
              </td>
              <td>
                {printAmount(Number(line.quantity) * Number(line.unitRate))}
              </td>
              <td>{printAmount(line.netAmount)}</td>
              <td>
                {printAmount(line.netAmount)}
              </td>
              <td>
                {Number(line.taxRate) === 0
                  ? "VAT 0%"
                  : line.taxCode || `VAT ${line.taxRate}%`}
              </td>
              <td>{line.taxRate}%</td>
              <td>{printAmount(line.vatAmount)}</td>
              <td>{printAmount(line.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}></td>
            <td>{printAmount(invoice.subtotal)}</td>
            <td>{printAmount(invoice.subtotal)}</td>
            <td></td>
            <td></td>
            <td>{printAmount(invoice.vatAmount)}</td>
            <td>{printAmount(invoice.total)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="summary-grid">
        <table>
          <thead>
            <tr>
              <th>Tax Summary</th>
              <th>Taxable Amt</th>
              <th>VAT %</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {taxGroups.map((group) => (
              <tr key={`${group.code}-${group.rate}`}>
                <td>{Number(group.rate) === 0 ? "0% VAT" : `VAT ${group.rate}%`}</td>
                <td>{printAmount(group.taxable)}</td>
                <td>{group.rate}</td>
                <td>{printAmount(group.vat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl>
          <dt>Total Invoice:</dt>
          <dd>{printAmount(invoice.total)} AED</dd>
          <dt>Rounded:</dt>
          <dd>0.00</dd>
          <dt>Net Total:</dt>
          <dd>{printAmount(invoice.total)} AED</dd>
        </dl>
        <p>
          <b>In Words:</b> AED {aedAmountInWords(invoice.total)}
        </p>
      </div>
      <footer className="invoice-footer">
        <section>
          <h2>Remarks</h2>
          {invoice.remarks && <p>{invoice.remarks}</p>}
          <ul>
            <li>This is a system-generated invoice. No signature or stamp is required.</li>
            <li>The company is not responsible for any cash settlement made without an official receipt.</li>
          </ul>
        </section>
        <section>
          <h2>Bank Details</h2>
          <dl>
            <dt>A/C Name</dt>
            <dd>TRANSWAVE SHIPPING AND LOGISTICS LLC</dd>
            <dt>A/C Number</dt>
            <dd>019102069975</dd>
            <dt>IBAN</dt>
            <dd>AE170330000019102069975</dd>
            <dt>Bank</dt>
            <dd>MASHREQ BANK</dd>
          </dl>
        </section>
      </footer>
      <small className="page-number">Page 1 of 1</small>
    </article>
  );
}

function JobTable({
  jobs,
  onOpen,
}: {
  jobs: JobSummary[];
  onOpen(id: string): void;
}) {
  return (
    <div className="table">
      <div className="thead">
        <span>Job</span>
        <span>Customer</span>
        <span>Route</span>
        <span>Mode</span>
        <span>Status</span>
      </div>
      {jobs.map((j) => (
        <button
          className="trow row-button"
          key={j.id}
          onClick={() => onOpen(j.id)}
        >
          <b>{j.jobNumber}</b>
          <span>{j.customerName}</span>
          <span>{route(j)}</span>
          <span>{j.transportMode}</span>
          <Tag text={label(j.status)} />
        </button>
      ))}
    </div>
  );
}
function Panel({
  title,
  sub,
  action,
  onAction,
  secondaryAction,
  onSecondaryAction,
  children,
}: {
  title: string;
  sub: string;
  action?: string;
  onAction?: () => void;
  secondaryAction?: string;
  onSecondaryAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>
        {(action || secondaryAction) && <div className="panel-actions">
          {action && (
            <button className="link-button" onClick={onAction}>
              {action}
            </button>
          )}
          {secondaryAction && (
            <button className="danger-link" onClick={onSecondaryAction}>
              {secondaryAction}
            </button>
          )}
        </div>}
      </div>
      {children}
    </section>
  );
}
function Metric({
  label: heading,
  value,
  note,
  good,
}: {
  label: string;
  value: string;
  note: string;
  good?: boolean;
}) {
  return (
    <article className={good ? "metric good" : "metric"}>
      <p>{heading}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Tag({ text }: { text: string }) {
  const tone = ["ACTIVE", "ISSUED", "COMPLETED", "PAID"].includes(text)
    ? "green"
    : text.includes("DRAFT") || text.includes("READY")
      ? "amber"
      : "blue";
  return <span className={`tag ${tone}`}>{text}</span>;
}
function Detail({ label: heading, value }: { label: string; value: string }) {
  return (
    <div className="detail">
      <small>{heading}</small>
      <b>{value}</b>
    </div>
  );
}
function EditorSurface({
  inline,
  visible,
  children,
}: {
  inline: boolean;
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={inline ? "editor-host" : "dialog-host"}
      hidden={inline && !visible}
    >
      <InlineEditorContext.Provider value={inline}>
        {children}
      </InlineEditorContext.Provider>
    </div>
  );
}
function Modal({
  title,
  wide,
  close,
  children,
}: {
  title: string;
  wide?: boolean;
  close(): void;
  children: React.ReactNode;
}) {
  const inline = useContext(InlineEditorContext);
  return (
    <div className={inline ? "page-form" : "overlay"}>
      <section
        className={`modal ${wide ? "wide-modal" : ""}`}
        role={inline ? undefined : "dialog"}
        aria-modal={inline ? undefined : true}
      >
        <div className="panel-head">
          <div>
            <p className="kicker">TRANSWAVE OPERATIONS</p>
            <h2>{title}</h2>
          </div>
          <button className="x" aria-label="Close" onClick={close}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function ConfirmationDialog({
  title,
  message: description,
  confirmLabel,
  danger,
  run,
  cancel,
}: Confirmation) {
  return (
    <div className="overlay confirmation-overlay">
      <section
        className="modal confirmation-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description"
      >
        <div className={danger ? "confirmation-icon danger" : "confirmation-icon"}>
          {danger ? "!" : "✓"}
        </div>
        <h2 id="confirmation-title">{title}</h2>
        <p id="confirmation-description">{description}</p>
        <div className="confirmation-actions">
          <button className="soft" onClick={cancel}>Cancel</button>
          <button className={danger ? "button danger-button" : "button"} onClick={() => void run()}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
function Field({
  label: heading,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      {heading}
      {children}
    </label>
  );
}
function WeightField({
  label: heading,
  name,
  unitName,
  defaultValue,
}: {
  label: string;
  name: string;
  unitName: string;
  defaultValue?: number | null;
}) {
  return (
    <Field label={heading}>
      <div className="measurement-input">
        <input
          name={name}
          type="number"
          min="0"
          step="0.001"
          inputMode="decimal"
          defaultValue={defaultValue == null ? "" : defaultValue / 1000}
        />
        <select
          name={unitName}
          defaultValue="MT"
          aria-label={`${heading} unit`}
        >
          <option value="MT">MT</option>
          <option value="KG">KG</option>
        </select>
      </div>
      <small className="input-help">
        Decimals are accepted. Metric tonnes are selected by default.
      </small>
    </Field>
  );
}
function FormSection({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="form-section">
      <div className="form-section-head">
        <h3>{title}</h3>
        <small>{note}</small>
      </div>
      {children}
    </section>
  );
}
function FormButtons({
  label: heading,
  close,
  disabled,
}: {
  label: string;
  close(): void;
  disabled?: boolean;
}) {
  return (
    <div className="form-actions">
      <button className="soft" type="button" onClick={close}>
        Cancel
      </button>
      <button className="button" disabled={disabled}>
        {heading}
      </button>
    </div>
  );
}
function PortSelect({
  name,
  ports,
  initial,
  optional,
}: {
  name: string;
  ports: Port[];
  initial?: string;
  optional?: boolean;
}) {
  return (
    <select name={name} required={!optional} defaultValue={initial}>
      <option value="">{optional ? "Direct shipment" : "Select port"}</option>
      {ports
        .filter((p) => p.active || p.id === initial)
        .map((p) => (
          <option value={p.id} key={p.id}>
            {p.name}
            {p.unLocode ? ` (${p.unLocode})` : ""}
          </option>
        ))}
    </select>
  );
}
