# TransWave Operations

TransWave is a logistics job and invoicing application. The repository is organized as a typed npm-workspace monorepo:

- `apps/web` — Next.js interface
- `apps/api` — NestJS/Fastify API
- `packages/contracts` — shared Zod request and response contracts
- `packages/database` — typed Supabase clients and generated database types
- `supabase` — local infrastructure, migrations, row-level security and seed data

## Local setup

Requirements: Node.js 24, npm 11, Docker Desktop and the Supabase CLI dependency installed by `npm install`.

```bash
npm install
npm run db:start
cp apps/api/.env.example apps/api/.env
```

Copy the local publishable key printed by `npm run db:status` into `apps/api/.env`, then run:

```bash
npm run dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3001/api/v1`
- Swagger: `http://localhost:3001/api/docs`
- Supabase Studio: `http://localhost:54323`

The local seed includes `finance@transwave.local` with password `Transwave123!`. It is development data only.

## Implemented persistence flow

The API supports authenticated users, company-scoped master data, jobs, charges, containers and invoice issuance. The portal includes a Users screen for owners and administrators to create accounts with temporary passwords, assign roles and activate or deactivate access.

- `GET /api/v1/jobs`
- `GET /api/v1/jobs/:id`
- `GET /api/v1/invoices`
- `GET /api/v1/invoices/:id`
- `POST /api/v1/invoices/drafts`
- `POST /api/v1/invoices/:id/issue`
- `GET|POST|PATCH /api/v1/users`
- `GET /api/v1/masters`
- `POST|PATCH /api/v1/masters/{customers|ports|services}`

Supabase row-level security isolates companies. Routes support an optional transshipment port between POL and POD. Containers are job-level records and are copied into the invoice snapshot; charges never link to containers. A database constraint allows each service only once per job and one current charge per job service. Draft creation atomically allocates selected charges so they cannot be invoiced twice. Issuance locks the invoice, assigns a branch/year sequence number, and preserves its customer, route, shipment, container and monetary snapshots.

The web interface signs in through Supabase Auth and sends the access token to the API. The API resolves company membership and Supabase row-level security isolates tenant records. The Supabase secret key is used only by the server for account administration and must never be exposed as a `NEXT_PUBLIC_` value.

## Verification

```bash
npm run test:unit
npm run typecheck
npm run lint
npm run build
```

With the API running on port 3001, this resets the local database and verifies tenant isolation plus the full job → draft → issued-invoice flow:

```bash
npm run test:smoke
```

Regenerate database types after changing migrations:

```bash
npm run db:types
```
