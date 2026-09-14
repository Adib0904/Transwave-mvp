"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
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
  SaveVendor,
  SaveVendorBill,
  Vendor,
  VendorBill,
} from "@transwave/contracts";
import { api } from "./api";
import { useAuth } from "./auth";
import { invoicePrintTitle, printInvoice } from "./print-invoice";
import {
  clearJobFormDraft,
  readJobFormDraft,
  saveJobFormDraft,
} from "./job-form-draft";
import { parseContainerManifest } from "./container-manifest";
import {
  chargeAmounts,
  formatChargeRate,
  type ChargeCurrency,
} from "./charge-money";
import "./invoice-flow.css";
import "./job-editor.css";

type NavigationPage =
  | "Dashboard"
  | "Customers"
  | "Jobs"
  | "Invoices"
  | "Costs"
  | "Masters"
  | "Users";
type Page = NavigationPage | "New Job";
type Dialog =
  | "customer"
  | "job"
  | "container"
  | "charge"
  | "invoice"
  | "port"
  | "service"
  | "user"
  | "vendor"
  | "vendorBill"
  | null;
type AssignedService = JobDetail["services"][number];
const money = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
});
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

export function Workspace() {
  const router = useRouter();
  const pathname = usePathname();
  const { session, user, signOut } = useAuth();
  const [page, setPage] = useState<Page>(
    pathname === "/jobs/new" ? "New Job" : "Dashboard",
  );
  const [masters, setMasters] = useState<MasterData | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [vendorBills, setVendorBills] = useState<VendorBill[]>([]);
  const [selectedVendorBill, setSelectedVendorBill] = useState<VendorBill | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingPort, setEditingPort] = useState<Port | null>(null);
  const [editingService, setEditingService] = useState<
    MasterData["services"][number] | null
  >(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [chargeService, setChargeService] = useState<{
    service: AssignedService;
    charge?: Charge;
  } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const canManageOperations = ["OWNER", "ADMIN", "OPERATIONS"].includes(
    user?.role ?? "VIEWER",
  );
  const canManageBilling = ["OWNER", "ADMIN", "FINANCE"].includes(
    user?.role ?? "VIEWER",
  );
  const canManageSetup = ["OWNER", "ADMIN"].includes(user?.role ?? "VIEWER");

  const load = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const [nextMasters, nextJobs, nextInvoices, nextVendorBills, nextUsers] =
        await Promise.all([
          api.masters(session),
          api.jobs(session),
          api.invoices(session),
          api.vendorBills(session),
          user && ["OWNER", "ADMIN"].includes(user.role)
            ? api.users(session)
            : Promise.resolve([]),
        ]);
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
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }, [session, user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (pathname === "/jobs/new") setPage("New Job");
    else setPage((current) => (current === "New Job" ? "Jobs" : current));
  }, [pathname]);

  async function openJob(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      setSelectedJob(await api.job(session, id));
      setPage("Jobs");
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function openInvoice(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      setSelectedInvoice(await api.invoice(session, id));
      setPage("Invoices");
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
      setPage("Costs");
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
  const nav = (next: Page) => {
    router.push(next === "New Job" ? "/jobs/new" : "/");
    setPage(next);
    setDialog(null);
    setError("");
  };
  const openNewJob = () => {
    setSelectedJob(null);
    setDialog(null);
    setError("");
    setPage("New Job");
    router.push("/jobs/new");
  };
  const closeJobPage = () => {
    setPage("Jobs");
    router.push("/");
  };
  if (!session || !user || !masters)
    return (
      <div className="center-state">{error || "Loading company data…"}</div>
    );
  const unbilled =
    selectedJob?.charges.filter((charge) => !charge.invoiceId) ?? [];

  const pages = (Object.keys(icons) as NavigationPage[]).filter(
    (item) => item !== "Users" || ["OWNER", "ADMIN"].includes(user.role),
  );
  return (
    <main className="app-shell">
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
              page === item || (page === "New Job" && item === "Jobs")
                ? "menu active"
                : "menu"
            }
            onClick={() => nav(item)}
          >
            <span>{icons[item]}</span>
            {item}
          </button>
        ))}
        <div className="user">
          <i>{user.email.slice(0, 2).toUpperCase()}</i>
          <div>
            <b>{user.email}</b>
            <small>{label(user.role)}</small>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void signOut()}
          >
            ↪
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p className="kicker">{user.companyName}</p>
            <h1>{page === "New Job" ? "Create job" : page}</h1>
          </div>
          <div className="header-actions">
            {page === "New Job" ? (
              <button className="soft" onClick={closeJobPage}>
                ← Back to jobs
              </button>
            ) : (
              <button className="soft" onClick={() => void load()}>
                Refresh
              </button>
            )}
            {page === "Customers" && canManageOperations && (
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
            {page === "Jobs" && canManageOperations && (
              <button className="button" onClick={openNewJob}>
                + New job
              </button>
            )}
            {page === "Costs" && canManageBilling && (
              <>
                <button className="soft" onClick={() => { setEditingVendor(null); setDialog("vendor"); }}>
                  + Vendor
                </button>
                <button className="button" onClick={() => { setSelectedVendorBill(null); setDialog("vendorBill"); }}>
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
        {busy && <div className="progress" />}
        {page === "Dashboard" && (
          <Dashboard
            jobs={jobs}
            invoices={invoices}
            onJob={openJob}
            onNavigate={nav}
          />
        )}
        {page === "Customers" && (
          <Customers
            customers={masters.customers}
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
            selected={selectedJob}
            canEdit={canManageOperations}
            canBill={canManageBilling}
            onOpen={openJob}
            onEdit={() => setDialog("job")}
            onContainer={() => setDialog("container")}
            onRemoveContainer={(id) =>
              void act(
                () => api.removeContainer(session, selectedJob!.id, id),
                setSelectedJob,
              )
            }
            onCharge={(service, charge) => {
              setChargeService({ service, charge });
              setDialog("charge");
            }}
            onRemoveCharge={(id) =>
              void act(
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
                  setPage("Jobs");
                  router.push("/");
                },
              )
            }
          />
        )}
        {page === "Invoices" && (
          <Invoices
            invoices={invoices}
            selected={selectedInvoice}
            canIssue={canManageBilling}
            onOpen={openInvoice}
            onIssue={() =>
              selectedInvoice &&
              void act(
                () => api.issueInvoice(session, selectedInvoice.id),
                setSelectedInvoice,
              )
            }
          />
        )}
        {page === "Costs" && (
          <Costs
            bills={vendorBills}
            vendors={masters.vendors}
            selected={selectedVendorBill}
            canEdit={canManageBilling}
            onOpen={openVendorBill}
            onEdit={() => setDialog("vendorBill")}
            onDelete={() => selectedVendorBill && void act(() => api.removeVendorBill(session, selectedVendorBill), () => setSelectedVendorBill(null))}
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
        <CustomerDialog
          initial={editingCustomer}
          currencies={masters.currencies}
          close={() => setDialog(null)}
          save={(input) =>
            void act(() =>
              editingCustomer
                ? api.updateCustomer(session, editingCustomer.id, input)
                : api.createCustomer(session, input),
            )
          }
        />
      )}
      {dialog === "job" && selectedJob && (
        <JobEditor
          initial={selectedJob}
          data={masters}
          draftOwner={user.userId}
          close={() => setDialog(null)}
          save={(input) =>
            act(
              () => api.updateJob(session, selectedJob.id, input),
              (value) => {
                setSelectedJob(value);
                setPage("Jobs");
              },
            )
          }
        />
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
        <ChargeDialog
          item={chargeService}
          taxes={masters.taxRates}
          currencies={masters.currencies}
          close={() => setDialog(null)}
          save={(input) =>
            void act(
              () => api.saveCharge(session, selectedJob.id, input),
              setSelectedJob,
            )
          }
        />
      )}
      {dialog === "invoice" && selectedJob && (
        <InvoiceDialog
          charges={unbilled}
          close={() => setDialog(null)}
          save={(ids) =>
            void act(
              () => api.createDraft(session, selectedJob.id, ids),
              (value) => {
                setSelectedInvoice(value);
                setPage("Invoices");
              },
            )
          }
        />
      )}
      {dialog === "port" && (
        <PortDialog
          initial={editingPort}
          close={() => setDialog(null)}
          save={(input) =>
            void act(() =>
              editingPort
                ? api.updatePort(session, editingPort.id, input)
                : api.createPort(session, input),
            )
          }
        />
      )}
      {dialog === "service" && (
        <ServiceDialog
          initial={editingService}
          data={masters}
          close={() => setDialog(null)}
          save={(input) =>
            void act(() =>
              editingService
                ? api.updateService(session, editingService.id, input)
                : api.createService(session, input),
            )
          }
        />
      )}
      {dialog === "user" && (
        <UserDialog
          initial={editingUser}
          canAssignOwner={user.role === "OWNER"}
          close={() => setDialog(null)}
          save={(input) =>
            void act(() =>
              editingUser
                ? api.updateUser(
                    session,
                    editingUser.id,
                    input as UpdateManagedUser,
                  )
                : api.createUser(session, input as CreateManagedUser),
            )
          }
        />
      )}
      {dialog === "vendor" && (
        <VendorDialog
          initial={editingVendor}
          close={() => setDialog(null)}
          save={(input) => void act(() => editingVendor ? api.updateVendor(session, editingVendor.id, input) : api.createVendor(session, input))}
        />
      )}
      {dialog === "vendorBill" && (
        <VendorBillDialog
          initial={selectedVendorBill}
          data={masters}
          jobs={jobs}
          invoices={invoices}
          bills={vendorBills}
          close={() => setDialog(null)}
          save={(input, file) => void act(async () => {
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
      )}
    </main>
  );
}

function Dashboard({
  jobs,
  invoices,
  onJob,
  onNavigate,
}: {
  jobs: JobSummary[];
  invoices: Invoice[];
  onJob(id: string): void;
  onNavigate(page: Page): void;
}) {
  const issued = invoices
    .filter((i) => i.status === "ISSUED")
    .reduce((sum, i) => sum + Number(i.total), 0);
  return (
    <>
      <div className="metrics">
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
          label="Issued value"
          value={money.format(issued)}
          note="All issued invoices"
        />
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
  canEdit,
  onEdit,
}: {
  customers: Customer[];
  canEdit: boolean;
  onEdit(c: Customer): void;
}) {
  return (
    <Panel
      title="Customer master"
      sub={`${customers.length} persisted billing profiles`}
    >
      <div className="table customers">
        <div className="thead">
          <span>Customer / ID</span>
          <span>VAT No.</span>
          <span>Currency</span>
          <span>Terms</span>
          <span>Status</span>
        </div>
        {customers.map((c) => (
          <button
            className="trow row-button"
            key={c.id}
            onClick={() => canEdit && onEdit(c)}
          >
            <div>
              <b>{c.name}</b>
              <small>{c.code}</small>
            </div>
            <span>{c.trn || "—"}</span>
            <span>{c.defaultCurrency}</span>
            <span>{c.paymentTermsDays} days</span>
            <Tag text={c.active ? "ACTIVE" : "INACTIVE"} />
          </button>
        ))}
      </div>
    </Panel>
  );
}

function Jobs(props: {
  jobs: JobSummary[];
  selected: JobDetail | null;
  canEdit: boolean;
  canBill: boolean;
  onOpen(id: string): void;
  onEdit(): void;
  onContainer(): void;
  onRemoveContainer(id: string): void;
  onCharge(s: AssignedService, c?: Charge): void;
  onRemoveCharge(id: string): void;
  onInvoice(): void;
  onOpenInvoice(id: string): void;
}) {
  const { jobs, selected } = props;
  return (
    <div className="job-layout">
      <Panel title="Jobs" sub={`${jobs.length} persisted records`}>
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
      </Panel>
      {selected ? (
        <Panel
          title={selected.jobNumber}
          sub={`${selected.customerName} · ${selected.transportMode}`}
          action={props.canEdit ? "Edit job" : undefined}
          onAction={props.onEdit}
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
                  : String(selected.packageCount)
              }
            />
            <Detail
              label="Weight / volume"
              value={
                [
                  selected.weightKg === null ? null : `${selected.weightKg} kg`,
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
                  : `${selected.chargeableWeightKg} kg`
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
            {props.canBill && selected.charges.some((c) => !c.invoiceId) && (
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
  onOpen,
  onIssue,
}: {
  invoices: Invoice[];
  selected: Invoice | null;
  canIssue: boolean;
  onOpen(id: string): void;
  onIssue(): void;
}) {
  return (
    <div className="invoice-layout">
      <Panel title="Invoices" sub={`${invoices.length} persisted records`}>
        <div className="invoice-list">
          {invoices.map((i) => (
            <button
              className={selected?.id === i.id ? "invoice selected" : "invoice"}
              key={i.id}
              onClick={() => onOpen(i.id)}
            >
              <b>{i.invoiceNumber || i.draftReference}</b>
              <span>{i.customerName}</span>
              <Tag text={i.status} />
              <strong>{money.format(Number(i.total))}</strong>
            </button>
          ))}
        </div>
      </Panel>
      {selected ? (
        <section className="panel invoice-document">
          <div className="panel-head">
            <div>
              <h2>{selected.invoiceNumber || selected.draftReference}</h2>
              <p>Job {selected.jobNumber}</p>
            </div>
            <Tag text={selected.status} />
          </div>
          <div className="detail-grid">
            <Detail label="Bill to" value={selected.customerName} />
            <Detail label="Customer TRN" value={selected.customerTrn || "—"} />
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
            {canIssue && selected.status === "DRAFT" && (
              <button className="button" onClick={onIssue}>
                Issue invoice
              </button>
            )}
            {selected.status === "ISSUED" && (
              <button
                className="button"
                onClick={() => printInvoice(invoicePrintTitle(selected))}
              >
                Print / Save PDF
              </button>
            )}
          </div>
          <PersistedPrint invoice={selected} />
        </section>
      ) : (
        <Panel title="Select an invoice" sub="View a draft or issued invoice">
          <p className="empty-panel">
            Issued invoice snapshots remain immutable.
          </p>
        </Panel>
      )}
    </div>
  );
}

function Costs({ bills, vendors, selected, canEdit, onOpen, onEdit, onDelete, onVendor, onOpenInvoice, onOpenDocument }: { bills: VendorBill[]; vendors: Vendor[]; selected: VendorBill | null; canEdit: boolean; onOpen(id: string): void; onEdit(): void; onDelete(): void; onVendor(vendor: Vendor): void; onOpenInvoice(id: string): void; onOpenDocument(path: string): void }) {
  const revenue = bills.reduce((sum, bill) => sum + Number(bill.revenueAllocatedAed), 0);
  const expense = bills.reduce((sum, bill) => sum + Number(bill.subtotalAed), 0);
  const profit = revenue - expense;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return <>
    <div className="metrics cost-metrics"><Metric label="Allocated income" value={money.format(revenue)} note="Customer revenue before VAT"/><Metric label="Vendor expense" value={money.format(expense)} note="Vendor cost before VAT"/><Metric label="Gross profit" value={money.format(profit)} note="Income minus vendor expense" good={profit >= 0}/><Metric label="Gross margin" value={`${margin.toFixed(1)}%`} note="On allocated income" good={margin >= 0}/></div>
    <div className="cost-layout"><Panel title="Vendor invoices" sub={`${bills.length} recorded expense${bills.length === 1 ? "" : "s"}`}><div className="invoice-list">{bills.map(bill=><button className={selected?.id===bill.id?"invoice selected":"invoice"} key={bill.id} onClick={()=>onOpen(bill.id)}><b>{bill.vendorInvoiceNumber}</b><span>{bill.vendorName} · {bill.jobNumber}</span><Tag text={bill.status}/><strong>{money.format(Number(bill.totalAmountAed))}</strong></button>)}</div></Panel>
    {selected?<section className="panel"><div className="panel-head"><div><h2>{selected.vendorInvoiceNumber}</h2><p>{selected.vendorName} · Job {selected.jobNumber}</p></div><Tag text={selected.status}/></div><div className="detail-grid"><Detail label="Vendor TRN" value={selected.vendorTrn||"—"}/><Detail label="Bill date" value={selected.billDate}/><Detail label="B/L number" value={selected.blNumber||"—"}/><div className="detail"><small>CUSTOMER INVOICE</small>{selected.customerInvoiceId?<button className="link-button" onClick={()=>onOpenInvoice(selected.customerInvoiceId!)}>{selected.customerInvoiceNumber}</button>:<b>Not linked</b>}</div><div className="detail"><small>VENDOR INVOICE PDF</small>{selected.sourceFilePath?<button className="link-button" onClick={()=>onOpenDocument(selected.sourceFilePath!)}>View {selected.sourceFileName}</button>:<b>Not uploaded</b>}</div></div><table className="charge-table"><thead><tr><th>Vendor service</th><th>Qty</th><th>Rate / FX</th><th>Cost AED</th><th>VAT</th></tr></thead><tbody>{selected.lines.map(line=><tr key={line.id}><td>{line.serviceName||line.description}<small>{line.description}</small></td><td>{line.quantity} {line.uom}</td><td>{formatChargeRate(line.currency,line.unitRate)}<small>{line.currency==="USD"?`1 USD = ${line.exchangeRate} AED`:"1 AED = 1 AED"}</small></td><td>{money.format(Number(line.netAmountAed))}</td><td>{money.format(Number(line.vatAmountAed))}</td></tr>)}</tbody></table><div className="profit-summary"><span><small>Allocated customer income</small><b>{money.format(Number(selected.revenueAllocatedAed))}</b></span><span><small>Vendor expense before VAT</small><b>{money.format(Number(selected.subtotalAed))}</b></span><span className={Number(selected.profitAed)>=0?"positive":"negative"}><small>Gross profit</small><b>{money.format(Number(selected.profitAed))}</b></span></div>{canEdit&&<div className="form-actions"><button className="danger-link" onClick={onDelete}>Delete</button><button className="button" onClick={onEdit}>Edit vendor invoice</button></div>}</section>:<Panel title="Select a vendor invoice" sub="Review its expense and gross profit"><p className="empty-panel">Link vendor expenses to customer income to see job profitability.</p></Panel>}</div>
    <Panel title="Vendor master" sub={`${vendors.length} shipping and service vendor${vendors.length===1?"":"s"}`}><div className="record-list">{vendors.length?vendors.map(vendor=><div key={vendor.id}><span><b>{vendor.name}</b><small>{vendor.code} · {vendor.defaultCurrency} · {vendor.trn||"No TRN"}</small></span><Tag text={vendor.active?"ACTIVE":"INACTIVE"}/>{canEdit&&<button className="link-button" onClick={()=>onVendor(vendor)}>Edit</button>}</div>):<p className="empty-inline">Add the first vendor before recording a vendor invoice.</p>}</div></Panel>
  </>;
}

type VendorBillLineDraft = SaveVendorBill["lines"][number] & { key: string };
const newVendorBillLine = (): VendorBillLineDraft => ({ key: crypto.randomUUID(), serviceId: null, description: "", quantity: "1", uom: "JOB", currency: "USD", exchangeRate: "3.685", unitRate: "0", taxRate: "0" });

function VendorDialog({initial,close,save}:{initial:Vendor|null;close():void;save(value:SaveVendor):void}) { return <Modal title={initial?"Edit vendor":"Add vendor"} close={close}><form onSubmit={event=>{event.preventDefault();const d=new FormData(event.currentTarget);save({name:String(d.get("name")),trn:nullable(d,"trn"),email:nullable(d,"email"),phone:nullable(d,"phone"),address:nullable(d,"address"),defaultCurrency:String(d.get("currency")) as "AED"|"USD",paymentTermsDays:Number(d.get("terms")),active:initial?.active??true})}}><div className="auto-number"><span>Vendor ID</span><b>{initial?.code||"Created automatically"}</b><small>Vendor invoices and costs remain linked to this record.</small></div><Field label="Legal name"><input name="name" required defaultValue={initial?.name}/></Field><div className="two"><Field label="TRN / VAT number"><input name="trn" defaultValue={initial?.trn||""}/></Field><Field label="Billing email"><input name="email" type="email" defaultValue={initial?.email||""}/></Field></div><Field label="Address"><textarea name="address" rows={3} defaultValue={initial?.address||""}/></Field><div className="three"><Field label="Phone"><input name="phone" defaultValue={initial?.phone||""}/></Field><Field label="Default currency"><select name="currency" defaultValue={initial?.defaultCurrency||"AED"}><option>AED</option><option>USD</option></select></Field><Field label="Payment terms"><input name="terms" type="number" min="0" max="365" defaultValue={initial?.paymentTermsDays??30}/></Field></div><FormButtons label="Save vendor" close={close}/></form></Modal>; }

function VendorBillDialog({initial,data,jobs,invoices,bills,close,save}:{initial:VendorBill|null;data:MasterData;jobs:JobSummary[];invoices:Invoice[];bills:VendorBill[];close():void;save(value:SaveVendorBill,file:File|null):void}) {
  const [jobId,setJobId]=useState(initial?.jobId||"");
  const [customerInvoiceId,setCustomerInvoiceId]=useState(initial?.customerInvoiceId||"");
  const [revenue,setRevenue]=useState(initial?.revenueAllocatedAed||"0.00");
  const [document,setDocument]=useState<File|null>(null);
  const [lines,setLines]=useState<VendorBillLineDraft[]>(initial?.lines.map(line=>({key:line.id,serviceId:line.serviceId,description:line.description,quantity:line.quantity,uom:line.uom,currency:line.currency as "AED"|"USD",exchangeRate:line.exchangeRate,unitRate:line.unitRate,taxRate:line.taxRate}))||[newVendorBillLine()]);
  const jobOptions = Array.from(new Map([
    ...jobs.map(job => [job.id, { id: job.id, jobNumber: job.jobNumber, customerName: job.customerName }] as const),
    ...invoices.map(invoice => [invoice.jobId, { id: invoice.jobId, jobNumber: invoice.jobNumber, customerName: invoice.customerName }] as const),
  ]).values());
  const availableInvoices=invoices.filter(invoice=>invoice.jobId===jobId);
  const remainingRevenue = (invoiceId: string) => {
    const invoice = invoices.find(item => item.id === invoiceId);
    const used = bills
      .filter(bill => bill.customerInvoiceId === invoiceId && bill.id !== initial?.id)
      .reduce((sum, bill) => sum + Number(bill.revenueAllocatedAed), 0);
    return Math.max(0, Number(invoice?.subtotal ?? 0) - used);
  };
  const expense=lines.reduce((sum,line)=>sum+chargeAmounts(Number(line.quantity)||0,Number(line.unitRate)||0,line.currency==="AED"?1:Number(line.exchangeRate)||0,Number(line.taxRate)||0).netAed,0);
  const updateLine=(key:string,values:Partial<VendorBillLineDraft>)=>setLines(current=>current.map(line=>line.key===key?{...line,...values}:line));
  return <Modal title={initial?"Edit vendor invoice":"Record vendor invoice"} wide close={close}><form onSubmit={event=>{event.preventDefault();const d=new FormData(event.currentTarget);save({vendorId:String(d.get("vendor")),jobId,customerInvoiceId:customerInvoiceId||null,vendorInvoiceNumber:String(d.get("number")),billDate:String(d.get("billDate")),dueDate:String(d.get("dueDate"))||null,dateOfSupply:String(d.get("supplyDate"))||null,blNumber:nullable(d,"bl"),department:nullable(d,"department"),remarks:nullable(d,"remarks"),sourceFileName:initial?.sourceFileName||null,status:String(d.get("status")) as SaveVendorBill["status"],revenueAllocatedAed:revenue,lines:lines.map(({key,...line})=>line)},document)}}><FormSection title="Vendor invoice" note="Supplier, job and source document"><div className="three"><Field label="Vendor"><select name="vendor" required defaultValue={initial?.vendorId||""}><option value="">Select vendor</option>{data.vendors.filter(v=>v.active||v.id===initial?.vendorId).map(v=><option value={v.id} key={v.id}>{v.name} · {v.code}</option>)}</select></Field><Field label="Job"><select name="job" required value={jobId} onChange={event=>{setJobId(event.target.value);setCustomerInvoiceId("");setRevenue("0.00")}}><option value="">Select job</option>{jobOptions.map(job=><option value={job.id} key={job.id}>{job.jobNumber} · {job.customerName}</option>)}</select></Field><Field label="Vendor invoice no."><input name="number" required defaultValue={initial?.vendorInvoiceNumber}/></Field></div><div className="three"><Field label="Invoice date"><input name="billDate" type="date" required defaultValue={initial?.billDate||new Date().toISOString().slice(0,10)}/></Field><Field label="Date of supply"><input name="supplyDate" type="date" defaultValue={initial?.dateOfSupply||""}/></Field><Field label="Due date"><input name="dueDate" type="date" defaultValue={initial?.dueDate||""}/></Field></div><div className="three"><Field label="B/L number"><input name="bl" defaultValue={initial?.blNumber||""}/></Field><Field label="Department"><input name="department" defaultValue={initial?.department||""}/></Field><Field label="Status"><select name="status" defaultValue={initial?.status||"DRAFT"}><option>DRAFT</option><option>APPROVED</option><option>PAID</option></select></Field></div><Field label={initial?.sourceFilePath?"Replace vendor invoice PDF":"Upload vendor invoice PDF"}><input className="file-input" type="file" accept="application/pdf,.pdf" required={!initial?.sourceFilePath} onChange={event=>setDocument(event.target.files?.[0]||null)}/><small className="input-help">{initial?.sourceFileName?`Currently uploaded: ${initial.sourceFileName}. Select a new PDF only to replace it.`:"PDF only, maximum 25 MB. The document is stored privately for your company."}</small></Field></FormSection>
  <FormSection title="Expense lines" note="Amounts are converted and reported in AED"><div className="vendor-line-head"><span>Description / service</span><span>Qty / unit</span><span>Currency / FX</span><span>Rate</span><span>VAT %</span></div>{lines.map((line,index)=><div className="vendor-line" key={line.key}><div><select aria-label={`Line ${index+1} service`} value={line.serviceId||""} onChange={event=>{const service=data.services.find(item=>item.id===event.target.value);updateLine(line.key,{serviceId:event.target.value||null,description:line.description||service?.name||"",uom:line.uom||service?.defaultUom||"JOB"})}}><option value="">Other expense</option>{data.services.map(service=><option value={service.id} key={service.id}>{service.name}</option>)}</select><input aria-label={`Line ${index+1} description`} required value={line.description} onChange={event=>updateLine(line.key,{description:event.target.value})} placeholder="Ocean freight"/></div><div><input aria-label={`Line ${index+1} quantity`} required type="number" min="0.001" step="0.001" value={line.quantity} onChange={event=>updateLine(line.key,{quantity:event.target.value})}/><input aria-label={`Line ${index+1} unit`} required value={line.uom} onChange={event=>updateLine(line.key,{uom:event.target.value})}/></div><div><select aria-label={`Line ${index+1} currency`} value={line.currency} onChange={event=>updateLine(line.key,{currency:event.target.value as "AED"|"USD",exchangeRate:event.target.value==="AED"?"1":"3.685"})}><option>AED</option><option>USD</option></select><input aria-label={`Line ${index+1} exchange rate`} required type="number" min="0.00000001" step="0.00000001" disabled={line.currency==="AED"} value={line.currency==="AED"?"1":line.exchangeRate} onChange={event=>updateLine(line.key,{exchangeRate:event.target.value})}/></div><input aria-label={`Line ${index+1} rate`} required type="number" min="0" step="0.01" value={line.unitRate} onChange={event=>updateLine(line.key,{unitRate:event.target.value})}/><div><input aria-label={`Line ${index+1} VAT`} required type="number" min="0" step="0.01" value={line.taxRate} onChange={event=>updateLine(line.key,{taxRate:event.target.value})}/><button className="danger-link" type="button" disabled={lines.length===1} onClick={()=>setLines(current=>current.filter(item=>item.key!==line.key))}>Remove</button></div></div>)}<button className="link-button" type="button" onClick={()=>setLines(current=>[...current,newVendorBillLine()])}>+ Add expense line</button><div className="dialog-total"><span>Vendor expense before VAT</span><b>{money.format(expense)}</b></div></FormSection>
  <FormSection title="Income link and profit" note="Allocate customer revenue once across vendor invoices"><div className="two"><Field label="Customer invoice"><select name="customerInvoice" value={customerInvoiceId} onChange={event=>{const id=event.target.value;setCustomerInvoiceId(id);setRevenue(id?remainingRevenue(id).toFixed(2):"0.00")}}><option value="">Not linked yet</option>{availableInvoices.map(invoice=><option value={invoice.id} key={invoice.id}>{invoice.invoiceNumber||invoice.draftReference} · {money.format(remainingRevenue(invoice.id))} available</option>)}</select></Field><Field label="Revenue allocated (AED, before VAT)"><input name="revenue" required type="number" min="0" max={customerInvoiceId?remainingRevenue(customerInvoiceId):0} step="0.01" value={revenue} onChange={event=>setRevenue(event.target.value)}/></Field></div><div className="profit-preview"><span>Allocated income <b>{money.format(Number(revenue)||0)}</b></span><span>Vendor expense <b>{money.format(expense)}</b></span><strong className={(Number(revenue)||0)-expense>=0?"positive":"negative"}>Gross profit <b>{money.format((Number(revenue)||0)-expense)}</b></strong></div><Field label="Remarks"><textarea name="remarks" rows={2} defaultValue={initial?.remarks||""}/></Field></FormSection><FormButtons label={initial?"Update vendor invoice":"Save vendor invoice"} close={close} disabled={!data.vendors.length||!jobId||!lines.every(line=>line.description)||(!initial?.sourceFilePath&&!document)}/></form></Modal>;
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
}: {
  data: MasterData;
  canEdit: boolean;
  onNewPort(): void;
  onEditPort(p: Port): void;
  onTogglePort(p: Port): void;
  onNewService(): void;
  onEditService(s: MasterData["services"][number]): void;
  onToggleService(s: MasterData["services"][number]): void;
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
      <Panel title="Company setup" sub="Authenticated tenant configuration">
        <Detail
          label="Branches"
          value={data.branches.map((b) => b.name).join(" · ")}
        />
        <Detail label="Currencies" value={data.currencies.join(" · ")} />
        <Detail
          label="Tax rates"
          value={data.taxRates.map((t) => `${t.code} ${t.rate}%`).join(" · ")}
        />
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
        Owners and administrators can create accounts, assign roles and suspend
        access. Only an owner can grant or change owner access.
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
          <Field label="VAT No.">
            <input
              name="trn"
              maxLength={32}
              defaultValue={initial?.trn || ""}
            />
          </Field>
          <Field label="Billing email">
            <input
              name="email"
              type="email"
              defaultValue={initial?.email || ""}
            />
          </Field>
        </div>
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
              defaultValue={initial?.defaultCurrency || "AED"}
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
  const [detectedContainers, setDetectedContainers] = useState(0);

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
          <Field label="No. of packages">
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
        {!initial && (
          <Field label="Container manifest">
            <textarea
              name="containerNumbers"
              rows={5}
              placeholder="DOLU2008497 / 20SD   CRXU3126290 / 20SD"
              onInput={(event) => event.currentTarget.setCustomValidity("")}
            />
            <small className="input-help">
              {detectedContainers
                ? `${detectedContainers} unique container${detectedContainers === 1 ? "" : "s"} detected. `
                : ""}
              Paste numbers with spaces, lines, commas or equipment labels such
              as / 20SD. Equipment labels are ignored and the container count
              updates automatically.
            </small>
          </Field>
        )}
        {initial && (
          <p className="form-help">
            Actual container numbers are managed in the Containers section on
            the job page.
          </p>
        )}
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
            pattern="[A-Za-z]{4}[0-9]{7}"
            placeholder="MSCU1234567"
          />
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
    item.charge?.currency === "USD" ? "USD" : "AED",
  );
  const [quantity, setQuantity] = useState(item.charge?.quantity || "1");
  const [unitRate, setUnitRate] = useState(item.charge?.unitRate || "");
  const [exchangeRate, setExchangeRate] = useState(
    item.charge?.currency === "USD" ? item.charge.exchangeRate : "1",
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
              defaultValue={item.charge?.uom || item.service.defaultUom}
            />
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
  close,
  save,
}: {
  charges: Charge[];
  close(): void;
  save(ids: string[]): void;
}) {
  const [ids, setIds] = useState(charges.map((c) => c.id));
  const total = charges
    .filter((c) => ids.includes(c.id))
    .reduce((sum, c) => sum + Number(c.totalAmount), 0);
  return (
    <Modal title="Create draft invoice" close={close}>
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
                {c.quantity} {c.uom} × {money.format(Number(c.unitRate))}
              </small>
            </span>
            <b>{money.format(Number(c.totalAmount))}</b>
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
        <button
          className="button"
          disabled={!ids.length}
          onClick={() => save(ids)}
        >
          Create draft
        </button>
      </div>
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
              defaultValue={initial?.defaultCurrency || "AED"}
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
            Owner/Admin: users and full setup · Operations: operational data ·
            Finance: job charges and invoices · Viewer: read only
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
            <dt>VAT ID (TRN)</dt>
            <dd>{invoice.customerTrn || "—"}</dd>
            <dt>Place of Supply</dt>
            <dd>{invoice.branchName}</dd>
            <dt>Due Date</dt>
            <dd>{printDate(invoice.dueDate)}</dd>
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
          <dd>{invoice.packageCount ?? "—"}</dd>
          <dt>HBL</dt>
          <dd>{invoice.hbl || "—"}</dd>
          <dt>MBL</dt>
          <dd>{invoice.mbl || "—"}</dd>
          <dt>Weight (KGS)</dt>
          <dd>{invoice.weightKg ?? "—"}</dd>
          <dt>Volume (CBM)</dt>
          <dd>{invoice.volumeCbm ?? "—"}</dd>
          <dt>Chargeable Weight</dt>
          <dd>{invoice.chargeableWeightKg ?? "—"}</dd>
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
              Taxable Value/
              <br />
              VAT Group
            </th>
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
                <br />
                {line.taxCode}
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
                <td>{group.code}</td>
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
          <b>In Words:</b> AED {printAmount(invoice.total)} ONLY
        </p>
      </div>
      <footer className="invoice-footer">
        <section>
          <h2>Remarks</h2>
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
  children,
}: {
  title: string;
  sub: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>
        {action && (
          <button className="link-button" onClick={onAction}>
            {action}
          </button>
        )}
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
  const tone = ["ACTIVE", "ISSUED", "COMPLETED"].includes(text)
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
  return (
    <div className="overlay">
      <section
        className={`modal ${wide ? "wide-modal" : ""}`}
        role="dialog"
        aria-modal="true"
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
          defaultValue={defaultValue ?? ""}
        />
        <select
          name={unitName}
          defaultValue="KG"
          aria-label={`${heading} unit`}
        >
          <option value="KG">KG</option>
          <option value="MT">MT</option>
        </select>
      </div>
      <small className="input-help">Choose kilograms or metric tonnes.</small>
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
