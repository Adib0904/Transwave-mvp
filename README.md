# TransWave Operations MVP

An initial Next.js interface and PostgreSQL schema for a logistics job-and-invoice system.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## What is present

- Dashboard: operational and financial headline metrics, jobs requiring attention, and activity timeline.
- Customer master: customer profiles, TRN, default currency, payment terms, and a create-customer flow.
- Job workspace: POL/POD port master, transport mode, shipment references, containers, and job-charge workflow.
- Invoice workspace: create a draft from selected unbilled job charges; inspect customer, route, shipment, equipment and container snapshots with quantity-aware, rounded line VAT and totals. Draft allocations prevent the same charge being selected twice.
- Payments, reports, and master-data views to validate the full operational workflow.
- PostgreSQL foundation for customers, branches, jobs, shipments, documents, containers, charges, invoices, line-level VAT, and multi-currency values.

All interactions use demonstration data only. Jobs, charges and new draft invoices are held in browser memory; refreshing resets them. Dashboard, Payments and Reports still show independent demo figures, not live draft totals. Customer creation and payment capture remain interface placeholders.

## Job to invoice testing

1. Open Jobs and choose a job. The first sample job has two initial charges; other jobs start without charges.
2. Use a service’s Add charge action to enter its agreed quantity, unit, AED rate and VAT. Once added, Edit charge updates that same row; each service has one charge per job. Charges already in a draft are locked and offer View draft. Pricing is entered per job, not reused from rate cards.
3. Choose Create invoice, select any unbilled charges, then Create draft. The app opens the saved draft in Invoices.
4. Return to Jobs: selected charges link to their draft. Remaining unbilled charges can be used in another draft. Creating a draft does not mark the job Invoiced.
5. Edit job details and reopen an existing draft: its copied details remain unchanged. Charges remain visible even if their service is later removed from the job.

6. Open a draft and choose Issue invoice. Review its customer and total, then confirm. The invoice becomes ISSUED with an issued date and remains locked. Cancel leaves it DRAFT. Issuance does not change the job status or send anything externally.

7. Issued invoices offer Print / Save PDF. This opens the browser’s print dialog with a dedicated A4 invoice layout; choose a printer or Save as PDF. Drafts do not have this final print action. The suggested filename uses the invoice ID. No server-generated PDF, email or bank details are added.

The invoice screen replaces the old static invoice list. Approval and invoice editing/deletion are not implemented in this flow. Both draft and issued invoices are held in memory; refresh is the prototype reset mechanism.

## Deliberately next

Persist the UI through a NestJS API and PostgreSQL, add authentication/roles and audit logs, then implement real approval, PDF/email, and payment integrations.
