# CafeManager

> **All-in-one operations dashboard for cafe managers and staff.**
> Built at Ala-Too International University · Team L&A · 2026

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org) [![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com) [![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://docker.com) [![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?logo=vercel)](https://cafe-manager-psi.vercel.app)

---

## Live Demo

**[cafe-manager-psi.vercel.app](https://cafe-manager-psi.vercel.app)**

---

## The Problem

Cafe owners and managers currently juggle multiple disconnected tools:

- Inventory tracked in Excel — always outdated
- Staff schedules sent manually via WhatsApp
- Revenue calculated by hand at end of day
- Tasks assigned by memory, often forgotten

**CafeManager** replaces all of that with one dashboard — real-time data, role-based access, and an AI assistant that speaks your language.

---

## Features

| Module | Description | Access |
|--------|-------------|--------|
| **Dashboard** | Live stats: revenue, low stock count, active staff, pending tasks | Admin, Manager |
| **Inventory** | Stock levels with OK / Low / Critical badges. Full CRUD. Min-quantity alerts. | Admin, Manager |
| **Staff** | Team roster with positions and shift scheduling. Role management. | All roles |
| **Menu** | Dishes with price, cost price, margin %. Toggle availability live. | Admin, Manager |
| **Tasks** | Create and assign tasks. Cycle status: Pending → In Progress → Done. | All roles |
| **Analytics** | Business metrics: total items, staff count, task breakdown by status. | Admin only |
| **AI Chat** | Natural language assistant with live database context. Auto-creates tasks and shifts. | Admin, Manager |

### Security

- JWT-based authentication via Supabase Auth (httpOnly cookies)
- Role-Based Access Control — 3 roles: `admin`, `manager`, `staff`
- Protected routes via Next.js middleware
- Row Level Security (RLS) policies in Supabase
- Audit logging for all admin actions
- Environment variables — no secrets in code

---

## Tech Stack

```
Frontend   →  Next.js 14 (App Router) · shadcn/ui · Tailwind CSS · TypeScript
Backend    →  Next.js Server Actions · API Routes · Audit Logging
Database   →  Supabase (PostgreSQL) · Row Level Security
Auth       →  Supabase Auth · JWT · httpOnly Cookies
AI         →  Groq API · Llama 3.3 70B · Live DB Context
DevOps     →  Docker · Docker Compose · GitHub Actions CI/CD · Vercel
```

### Architecture

```
Browser
  │
  ├── Next.js App Router (pages + layouts)
  │     ├── Server Components  → fetch data from Supabase directly
  │     ├── Client Components  → interactive UI (forms, tables, toggles)
  │     └── Middleware         → JWT validation + route protection
  │
  ├── Server Actions ("use server")
  │     ├── CRUD operations    → products, staff, menu, tasks
  │     ├── requirePermission  → RBAC check on every action
  │     └── revalidatePath     → cache invalidation after mutations
  │
  ├── Supabase
  │     ├── PostgreSQL         → 6 tables with foreign keys
  │     ├── Auth               → JWT tokens, session refresh
  │     └── RLS Policies       → row-level access control
  │
  └── Groq AI
        ├── Live DB snapshot injected into system prompt
        ├── Natural language Q&A about cafe operations
        └── Admin commands → auto-create tasks and shifts
```

---

## Database Schema

```sql
products      (id, name, category, quantity, unit, min_quantity, created_at)
staff         (id, name, role, position, phone, email, user_id, created_at)
schedules     (id, staff_name, date, shift_start, shift_end, status)
menu_items    (id, name, category, price, cost_price, is_available)
tasks         (id, title, description, status, assigned_to, due_date, created_at)
activity_logs (id, user_id, action, resource, details, created_at)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker + Docker Compose
- Supabase account
- Groq API key — free at [console.groq.com](https://console.groq.com)

### 1. Clone the repository

```bash
git clone https://github.com/SergioMavrodi/CafeManager.git
cd CafeManager
```

### 2. Set up environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GROQ_API_KEY=your_groq_api_key
```

> Never commit `.env.local` to git. It is already in `.gitignore`.

### 3. Run with Docker

```bash
docker compose up --build
```

### 4. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Build for production

```bash
npm run build
npm start
```

---

## Project Structure

```
CafeManager/
├── src/
│   ├── app/
│   │   ├── (dashboard)/          # Protected routes
│   │   │   ├── dashboard/        # Main overview page
│   │   │   ├── inventory/        # Stock management
│   │   │   ├── staff/            # Team management
│   │   │   ├── menu/             # Menu management
│   │   │   ├── tasks/            # Task management
│   │   │   ├── analytics/        # Business metrics + AI chat
│   │   │   └── layout.tsx        # Dashboard layout with sidebar
│   │   ├── api/
│   │   │   └── ai-chat/          # Groq AI endpoint
│   │   ├── auth/                 # Auth server actions
│   │   └── login/                # Login page
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── inventory/            # Inventory view components
│   │   ├── staff/                # Staff view components
│   │   ├── menu/                 # Menu view components
│   │   ├── tasks/                # Tasks view components
│   │   ├── analytics/            # AI chat widget
│   │   └── cafe-app-sidebar.tsx  # Main navigation sidebar
│   ├── lib/
│   │   ├── supabase/             # Supabase client (server + browser)
│   │   ├── db/                   # Database query helpers
│   │   ├── rbac.ts               # Role definitions and permissions
│   │   ├── rbac.server.ts        # Server-side permission checks
│   │   └── audit.ts              # Audit logging helpers
│   └── middleware.ts             # Route protection
├── Dockerfile
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions pipeline
└── supabase/
    └── schema.sql                # Database schema
```

---

## CI/CD Pipeline

Every push to `main` triggers GitHub Actions:

```
Push → Install → Lint → Build → Docker Build → Deploy to Vercel
```

---

## User Roles

| Permission | Admin | Manager | Staff |
|-----------|-------|---------|-------|
| Dashboard | ✅ | ✅ | ❌ |
| Inventory | ✅ | ✅ | ❌ |
| Staff | ✅ | ✅ | ✅ view only |
| Menu | ✅ | ✅ | ❌ |
| Tasks | ✅ | ✅ | ✅ |
| Analytics + AI Chat | ✅ | ✅ | ❌ |
| User management | ✅ | ❌ | ❌ |

---

## Team

| Role | Name | Responsibilities |
|------|------|-----------------|
| Project Manager | **Akzhol** | Scope, Trello, standups, presentation |
| Backend Developer | **Askar** | DB schema, server actions, auth, RBAC, audit |
| Frontend Developer | **Erzhan** | UI pages, shadcn/ui, dark mode, dashboard |
| DevSecOps Engineer | **Erturan** | Docker, GitHub Actions, middleware, security |
| AI Engineer | **Abilai** | Groq integration, DB context, auto-commands |

---

## AI Assistant

The AI Chat is accessible on the Analytics page for admin and manager roles.

```
You:  Which products need restocking?
AI:   3 items below minimum:
      — Coffee Beans: 8kg (min 10kg)
      — Oat Milk: 4L (min 8L)
      — Straws: 3pcs (min 100pcs)

You:  Order products
AI:   Done. Created 3 purchase tasks — check the Tasks page.

You:  Generate shifts for next week
AI:   Done. 26 shifts created for 7 staff members across 7 days.
```

---

*Built with Next.js, Supabase, Groq, and a lot of coffee ☕*
