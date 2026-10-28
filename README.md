# OffMenu

WhatsApp-first direct restaurant ordering platform.

## Product

Customers discover local restaurants through WhatsApp, select food, provide their delivery address and place an order.

Restaurants handle:

- Food preparation
- Delivery
- COD
- UPI
- Customer support

OffMenu handles:

- Restaurant discovery
- Menu catalogue
- Order creation
- WhatsApp automation
- Restaurant order notification
- Admin management
- Platform fee tracking

## Stack

- Next.js
- TypeScript
- Turso
- SQLite
- Drizzle ORM
- Vercel
- WhatsApp Business Cloud API

## Business model

The initial platform fee target is ₹30 per completed order.

OffMenu does not operate its own delivery fleet and does not process customer payments.

## Environment variables

Copy `.env.example` into `.env.local` when configuring the application.

Required services:

- Turso
- Meta WhatsApp Business Cloud API
- Meta WhatsApp App Secret (`WHATSAPP_APP_SECRET`) for webhook signature verification
- `ADMIN_SECRET` for signing admin and restaurant sessions (required in production)
- Vercel

## WhatsApp delivery reliability

Inbound webhook processing records a durable claim and commits database effects,
queued WhatsApp messages, and completion state in one transaction. Outbound
messages are stored in `whatsapp_outbox` and sent by the authenticated
`POST /api/whatsapp/outbox` worker endpoint. Configure a high-entropy
`WHATSAPP_OUTBOX_WORKER_TOKEN` and have a trusted scheduler call that endpoint
regularly with `Authorization: Bearer <token>`. The endpoint processes up to 20
due messages per call; failed sends are retried with exponential backoff for at
most 10 attempts, then retained as `DEAD` for operational review.

## Database schema and migration safety

`db/schema.ts` is the canonical schema. `drizzle/bootstrap.sql` is exported from
it with `npx drizzle-kit export --config drizzle.config.ts`. Use
`npm run db:migrate` as the supported initializer/reconciler: it bootstraps an
empty database, or recognizes the known legacy application tables and applies
only missing additive columns, feature tables, and indexes. It validates the
result and writes its own `_offmenu_schema_migrations` record transactionally.
Unknown or partial schemas fail without committing changes.

The numbered Drizzle SQL files and snapshots are preserved historical artifacts;
they contain gaps and metadata that may describe database state not produced by
their SQL. Do not run `drizzle-kit migrate` or `drizzle-kit push` against an
existing database. The custom runner leaves the Drizzle migration ledger alone.
For remote databases it also requires `OFFMENU_REMOTE_MIGRATION_ACK` to equal
`TARGET_AND_BACKUP_VERIFIED`; set that only after verifying the target, live
schema, ledger, and backup. Production schema state must not be inferred from
snapshots or the local `.env` target.

WhatsApp does not provide a provider-side idempotency guarantee for these send
requests. If the provider accepts a message but the worker loses the response
or crashes before marking the row sent, a later retry can deliver a duplicate.
