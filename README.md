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
- Vercel