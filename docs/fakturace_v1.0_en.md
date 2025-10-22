
# 📘 Project: Fakturace v1.0 (English Version)

## 🧱 Overview
**Fakturace** is an open‑source system for preparing billing documents and managing costs of hardware, software, and services provided to clients.  
It integrates invoice import, validation, item breakdown, assignment to organizations, technician work logs, and invoice draft generation.

---

## 🎯 Project Goals
- Automate import of incoming invoices (HW, SW, services)
- Allow item breakdown into single units and assignment to organizations
- Centralize technician work records
- Generate invoice drafts including margins, VAT, and service fees
- Lock accounting periods (LOCK)
- Maintain a complete audit trail of all operations
- Keep the entire stack 100% open‑source

---

## 🔧 System Architecture
| Layer | Technology | Description |
|--------|-------------|-------------|
| **Frontend** | **Next.js 14 (App Router, React 18)** | Modern React framework with SSR, ISR, and app layouts |
| **UI Framework** | Mantine v7 | Open‑source UI kit (dark mode, grid, forms, tables) |
| **Forms & Validation** | React Hook Form + Zod | Shared front‑back validation with full type safety |
| **Data Management** | TanStack Query + Table | Fetching, caching, pagination, optimistic updates |
| **Backend** | Node.js + Express | REST API powered by Prisma ORM |
| **ORM** | Prisma + PostgreSQL | JSONB fields, transactions, partial indexes |
| **File Storage** | MinIO (S3 compatible) with local fallback | OCR artefacts, PDF exports, Pohoda XML (migration script available) |
| **Async Jobs** | BullMQ + Redis (fallback inline mode) | OCR processing, PDF/XML exports, queue health endpoint |
| **OCR Provider** | Mistral OCR (optional) / ISDOC parser / OCRmyPDF | Invoice recognition |
| **Observability** | _Planned_: OpenTelemetry + Prometheus/Grafana | Metrics, logs, tracing |
| **Deployment** | Native or Docker Compose | Runs locally and containerized |

---

## 🗂️ Main Modules
- **Organizations** – client records, service fees, margins, ARES company lookup  
- **Received Invoices** – import, OCR, validation, item breakdown  
- **Hardware / Software Pool** – individual items assigned to organizations  
- **Work Records** – technician logs: time, km, description, approval workflow  
- **Billing / Invoicing** – draft and invoice generation  
- **Accounting Periods** – LOCK feature for closed months  
- **Audit Log** – automatic tracking of all changes with diffs  
- **Administration & Settings** – color scheme preferences, user management (role assignment, password resets)

---

## 🧩 Core Data Model (simplified)
- **Organization** `{ id, name, ico, dic?, email?, phone?, address?, hardwareMarginPct, softwareMarginPct, outsourcingFeeCents, isActive }`
- **ReceivedInvoice** `{ id, supplierName, invoiceNumber, issueDate?, totalWithoutVatCents, totalWithVatCents, currency, digest(unique), status }`
- **ReceivedInvoiceItem** `{ id, invoiceId, description, productCode?, quantity, unitPriceCents, totalPriceCents, vatRate, assignedOrganizationId? }`
- **Hardware** `{ id, sourceInvoiceItemId(unique), itemName, unitPriceCents, totalPriceCents, vatRate, status(NEW|ASSIGNED|INVOICED), assignedOrganizationId?, month, year, assignedAt? }`
- **WorkRecord** `{ id, organizationId, userId, date, minutes, kilometers, description, status(DRAFT|SUBMITTED|APPROVED), month, year }`
- **Service** `{ id, organizationId, serviceName, monthlyPriceCents, isActive }`
- **BillingDraft** `{ id, organizationId, month, year, data(JSONB), roundingMode?, updatedBy?, timestamps }`
- **Invoice** `{ id, organizationId, invoiceNumber(unique), status(DRAFT|SENT|PAID|CANCELLED), totalAmountCents, totalVatCents, currency, roundingMode?, generatedAt }`
- **AccountingPeriod** `{ id, year, month, lockedAt? }`
- **AuditLog** `{ id, actorId?, entity, entityId, action, diffJson, createdAt }`

---

## 🧮 Main Features and Workflow
1. **Invoice Import** – upload, OCR, digest deduplication, save to DB and MinIO  
2. **Item Breakdown and Assignment** – split items, assign to organizations  
3. **Work Records** – technicians log work, workflow SUBMITTED → APPROVED  
4. **Invoicing** – create draft from records and HW/SW, calculate VAT/margins, export ISDOC/PDF  
5. **Accounting Lock** – lock a period to prevent edits  
6. **Audit** – automatic logging of all operations (CREATE/UPDATE/DELETE/ASSIGN/GENERATE)
7. **Role-Based Access Control** – ADMIN / ACCOUNTANT / TECHNICIAN / VIEWER permissions enforced in API & UI

---

## 🧠 Frontend: Next.js 14 (App Router)
Mantine UI, TanStack Query, RHF + Zod, i18n, lucide-react, responsive design, invoice wizard, keyboard shortcuts.

---

## 🔒 Roles and Access Control
| Role | Key Permissions |
|------|----------------|
| **ADMIN** | Full control, queue monitoring, accounting locks, audit log access |
| **ACCOUNTANT** | Generate/export invoices, approve received invoices, edit billing drafts, manage hardware |
| **TECHNICIAN** | Create/edit own work records (read-only elsewhere) |
| **VIEWER** | Read-only access to billing summary and reporting |

> Permissions are centrally defined (`queues:read`, `billing:write`, `receivedInvoices:ocr`, …) and surfaced in the frontend (navigation, action buttons) as well as guarded in backend routes.

### Administration
- The **Settings** module allows administrators to switch Mantine's color scheme (light/dark) per user preferences.  
- Section **User Management** is available only to `ADMIN` role (`users:manage` permission). Admins can list users, assign roles, reset passwords, and remove accounts.

---

## 💰 Accounting Logic
- All monetary values stored in **integer cents**
- Currency: `CZK`, `EUR`, `USD`
- VAT rates 0 / 12 / 21 %; calculated per item, invoice = item sum
- Stored **roundingMode** (`HALF_UP`, `BANKERS`, …)
- Margins and service fees by organization

---

## 🧾 API Overview
| Endpoint | Description |
|-----------|-------------|
| `POST /api/received-invoices/upload` | Upload, idempotent with digest check |
| `POST /api/hardware/split` | Break items into single units |
| `POST /api/hardware/assign` | Assign items to organization |
| `POST /api/work-records` | Create work record |
| `POST /api/billing/draft` | Create invoice draft |
| `POST /api/invoices/generate` | Generate final invoice |
| `GET /api/invoices/:id/pdf` | Download/generated PDF (BullMQ job, stored in MinIO) |
| `GET /api/invoices/:id/pohoda-xml` | Download/generated Pohoda XML export |
| `GET /api/invoices/:id/isdoc` | Download/generated ISDOC document |
| `POST /api/accounting/lock` | Lock accounting period |
| `GET /api/audit` | List audit logs |
| `GET /api/system/queues` | Queue health (OCR/PDF/XML) – ADMIN only |

---

## ⚙️ Deployment Modes
- **Without Docker:** native PostgreSQL, Redis, MinIO services  
- **With Docker:** Compose orchestration for easy setup  
- **CI/CD:** GitHub Actions (lint, build, migrate, test)  
- **Monitoring:** OpenTelemetry → Prometheus, Grafana, Loki

---

## ✅ Summary
**Fakturace v1.0** is a complete open‑source solution for managing incoming invoices, technician work logs, and invoice preparation.  
Built on a modern OSS stack (**Next.js, Mantine, React Query, Express, Prisma, PostgreSQL, Redis, MinIO**) it supports **auditing, role-based access control, period locking, OCR with job queue, VAT/margin calculation, ISDOC/PDF export** and remains extensible. Observability (OpenTelemetry/Prometheus) is planned as a follow-up milestone.
