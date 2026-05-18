<div align="center">

<img src="https://img.shields.io/badge/Next.js-16.1.6-black?style=for-the-badge&logo=next.js&logoColor=white" />
<img src="https://img.shields.io/badge/React-19.2.3-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
<img src="https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" />
<img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" />
<img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge" />

<br/><br/>

# 🎓 OJT Track — QR-Based Intern Attendance System

### A full-stack, real-time On-the-Job Training attendance management platform  
### for **ISUFST Dingle Campus** · **College of Information and Communications Technology**

<br/>

> Replaces paper-based DTR with a digital, QR-powered attendance system featuring  
> offline resilience, automated report generation, and a dual-role portal for admins and interns.

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [System Architecture](#-system-architecture)
- [Database Schema](#-database-schema)
- [Screenshots & User Flow](#-screenshots--user-flow)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [API Reference](#-api-reference)
- [Deployment](#-deployment)
- [Suggested Repository Name](#-suggested-repository-name)
- [Author](#-author)

---

## 🌐 Overview

**OJT Track** is a production-ready web application designed to digitize and streamline the On-the-Job Training (OJT) attendance process for university departments. Built for the **ISUFST Dingle Campus — CICT Department**, the system replaces manual paper-based Daily Time Records (DTR) with a fast, accurate, and tamper-resistant QR code scanning workflow.

The platform provides two distinct role-based portals:

| Role | Access | Capabilities |
|------|--------|-------------|
| 🔐 **Administrator** | `/admin` | Dashboard analytics, QR scanning, intern management, DTR report generation, ID printing, leave request review |
| 👤 **Intern** | `/intern` | Personal QR code display, OJT progress tracking, attendance logbook, leave request submission |

---

## ✨ Key Features

### 🔴 Admin Portal

| Feature | Description |
|---------|-------------|
| **📊 Real-Time Dashboard** | Live analytics showing morning & afternoon check-in/out counts, pending leave requests, and total intern stats — all in one view |
| **📷 QR Code Scanner** | Camera-based HTML5 QR scanner with support for Morning/Afternoon sessions, overtime override, and manual time entry for late arrivals |
| **📴 Offline Mode** | Scans are queued locally when internet is unavailable and automatically synced to Supabase when connectivity is restored |
| **🗂 Intern Management** | Add, search, edit required hours, delete interns, and manage individual attendance logs with a paginated table |
| **📅 Attendance Logbook** | Full system-wide attendance log with Daily / Monthly / All-Time filtering, AM/PM session columns, and stale check-in detection |
| **📄 Monthly DTR Reports** | Generate pixel-perfect PDF Daily Time Records per intern with ISUFST official letterhead, signature blocks, Late/Undertime flags, and bulk ZIP export for all interns |
| **📤 CSV Export** | Export filtered attendance data as spreadsheet-ready `.csv` files per month |
| **🪪 Printable ID Generator** | Auto-generate standard CR80 ID cards with embedded QR codes for all registered interns, optimized for print layout |
| **✅ Leave Request Review** | Approve or reject intern leave requests with optional admin notes from the dashboard |

### 🟢 Intern Portal

| Feature | Description |
|---------|-------------|
| **📲 Personal QR Pass** | Holographic-styled card with unique UUID-encoded QR code for scanning at the admin terminal |
| **📈 OJT Progress Tracker** | Animated SVG donut chart showing rendered hours vs. required hours (default: 600h) with percentage completion |
| **📓 Attendance Logbook** | Filterable personal attendance log with AM/PM session columns, paginated and grouped by date |
| **📆 Leave Request System** | Submit excused absence requests with date and reason; track status (Pending / Approved / Rejected) with admin notes |
| **✏️ Profile Self-Management** | Update full name, username, and password directly from the dashboard |
| **📅 Monthly Summary** | Quick glance at current month's hours rendered and days present |

---

## 🛠 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | [Next.js](https://nextjs.org) (App Router) | 16.1.6 |
| **UI Library** | [React](https://react.dev) | 19.2.3 |
| **Database & BaaS** | [Supabase](https://supabase.com) (PostgreSQL) | 2.99.1 |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) | 12.35.2 |
| **QR Scanning** | [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 2.3.8 |
| **QR Generation** | [react-qr-code](https://github.com/rosskhanas/react-qr-code) | 2.0.18 |
| **PDF Generation** | [jsPDF](https://github.com/parallax/jsPDF) | 4.2.0 |
| **Canvas Rendering** | [html2canvas](https://html2canvas.hertzen.com/) | 1.4.1 |
| **File Downloads** | [file-saver](https://github.com/eligrey/FileSaver.js) | 2.0.5 |
| **ZIP Packaging** | [JSZip](https://stuk.github.io/jszip/) | 3.10.1 |
| **Alert Dialogs** | [SweetAlert2](https://sweetalert2.github.io/) | 11.26.22 |
| **Styling** | Vanilla CSS (Custom Properties / CSS Variables) | — |
| **Linting** | ESLint + eslint-config-next | 9.x |

---

## 🏗 System Architecture

```
ojt-attendance/
├── src/
│   ├── app/
│   │   ├── admin/
│   │   │   ├── dashboard/      # Live analytics & system logbook
│   │   │   ├── scanner/        # QR camera scanner (offline-capable)
│   │   │   ├── interns/        # Intern CRUD management
│   │   │   ├── reports/        # DTR PDF & CSV export engine
│   │   │   ├── ids/            # Printable QR ID card generator
│   │   │   └── login/          # Admin authentication
│   │   ├── intern/
│   │   │   ├── dashboard/      # Personal QR pass, progress, logbook
│   │   │   ├── login/          # Intern authentication
│   │   │   └── register/       # Intern self-registration
│   │   ├── api/
│   │   │   └── scan/           # Server-side scan processing endpoint
│   │   ├── globals.css         # Design system (CSS custom properties)
│   │   └── layout.js           # Root layout
│   ├── components/
│   │   ├── CustomDatePicker.js       # Calendar date picker component
│   │   ├── CustomMonthPicker.js      # Month selector component
│   │   └── ManageAttendanceModal.js  # Per-intern attendance CRUD modal
│   ├── lib/
│   │   └── supabase-browser.js       # Supabase client singleton
│   └── utils/
│       ├── time.js             # Manila timezone helpers & hour calculations
│       ├── swal-configs.js     # SweetAlert2 themed alert presets
│       ├── debounce.js         # QR scan debouncer & UUID validator
│       ├── logo-isufst.js      # ISUFST logo (Base64) for PDF headers
│       └── logo-bagong.js      # Bagong Pilipinas logo (Base64) for DTR
├── database/
│   └── supabase_schema.sql     # Full database schema (safe to re-run)
├── public/
│   ├── success.mp3             # Audio feedback on successful scan
│   └── error.mp3               # Audio feedback on scan error
└── next.config.mjs
```

---

## 🗄 Database Schema

The system uses **3 core tables** in Supabase (PostgreSQL):

```sql
-- Registered OJT interns
interns (
  id              BIGINT PRIMARY KEY,
  uuid            UUID UNIQUE,          -- encoded in QR code
  full_name       TEXT,
  username        TEXT UNIQUE,
  password        TEXT,
  required_hours  NUMERIC DEFAULT 600,
  created_at, updated_at
)

-- Time-in / time-out records
attendance (
  id          BIGINT PRIMARY KEY,
  intern_id   BIGINT → interns(id),
  time_in     TIMESTAMPTZ,
  time_out    TIMESTAMPTZ,             -- NULL while still checked in
  created_at
)

-- Excused absence requests
leave_requests (
  id            UUID PRIMARY KEY,
  intern_id     BIGINT → interns(id),
  date_of_leave DATE,
  reason        TEXT,
  status        TEXT  CHECK (pending | approved | rejected),
  admin_notes   TEXT,
  created_at, updated_at
)
```

> All tables include Row Level Security (RLS) policies and relevant indexes for performance. Auto-update triggers maintain `updated_at` fields automatically.

---

## 📸 Screenshots & User Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     ADMIN FLOW                              │
│  Login → Dashboard (stats + logbook) → Scanner (QR cam)    │
│       → Interns (CRUD) → Reports (DTR PDF/CSV)             │
│       → Printable IDs → Leave Request Review               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     INTERN FLOW                             │
│  Register → Login → Dashboard (QR pass + progress chart)   │
│          → Attendance Logbook → Leave Request Submission    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  SCAN FLOW (QR Terminal)                    │
│  Select Session (AM/PM) + Mode (In/Out)                    │
│  → Start Camera → Intern presents QR → UUID validated      │
│  → POST /api/scan → Supabase upsert → Audio + Alert        │
│  [Offline] → Queue to localStorage → Sync on reconnect     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18.x
- **npm** ≥ 9.x (or `yarn` / `pnpm`)
- A **Supabase** project (free tier works)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/ojt-track.git
cd ojt-track
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Set Up the Database

Copy the contents of [`database/supabase_schema.sql`](./database/supabase_schema.sql) and run it in your **Supabase SQL Editor**. It is idempotent and safe to re-run.

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Default Admin Access:** Navigate to `/admin/login` and use the credentials configured in your database or Supabase dashboard.

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Supabase anonymous/public API key |

> ⚠️ Never commit your `.env.local` file. It is already included in `.gitignore`.

---

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── admin/              # Protected admin-only routes
│   ├── intern/             # Intern self-service routes
│   └── api/scan/           # REST API for QR scan processing
├── components/             # Reusable UI components
├── lib/                    # Third-party client configurations
└── utils/                  # Pure helper functions & shared configs
```

---

## 🔌 API Reference

### `POST /api/scan`

Processes a QR code scan event (check-in or check-out).

**Request Body:**
```json
{
  "uuid": "string",           // Intern's unique UUID from QR code
  "mode": "time-in | time-out",
  "sessionType": "morning | afternoon",
  "overtime": false,           // Override time restrictions
  "explicitTime": "ISO string | null"  // Manual time entry
}
```

**Response (per result):**
```json
{
  "results": [
    {
      "status": "ok | duplicate | already_checked_out | not_checked_in | missing | invalid_time",
      "name": "Intern Full Name",
      "session": "morning | afternoon"
    }
  ]
}
```

**Status Codes:**

| Status | Meaning |
|--------|---------|
| `ok` | Scan successfully recorded |
| `duplicate` | Intern already scanned for this session today |
| `already_checked_out` | Time-out already recorded |
| `not_checked_in` | Time-out attempted without a prior time-in |
| `missing` | UUID not found in database |
| `invalid_time` | Scan attempted outside allowed session window |

---

## 📦 Deployment

This project is optimized for deployment on **Vercel** (recommended for Next.js).

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Add your environment variables in the **Vercel Dashboard → Project Settings → Environment Variables**.

### Build for Production (Self-hosted)

```bash
npm run build
npm start
```

> Ensure your hosting environment supports Node.js ≥ 18.x and has the required environment variables set.

---

---

## 🤝 Contributing

This project was developed for academic submission at **ISUFST Dingle Campus**. Contributions, issue reports, and suggestions are welcome for future iterations.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

<div align="center">

**Lou Vincent Baroro**  
*BS Information Technology · ISUFST Dingle Campus*

Designed and developed as a capstone-level academic project for the  
**College of Information and Communications Technology (CICT)**  
*Iloilo State University of Fisheries Science and Technology*

---

*Built with ❤️ using Next.js, React, and Supabase*

</div>
