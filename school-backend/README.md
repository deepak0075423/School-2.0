# School Management System

A full-featured, multi-tenant school management web application built with **Node.js**, **Express**, **MongoDB**, and **EJS**. It supports multiple schools on a single instance, with per-school module toggles controlled by a Super Admin.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [User Roles](#user-roles)
- [Module System](#module-system)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the App](#running-the-app)
- [First Login Flow](#first-login-flow)
- [Default Credentials](#default-credentials)

---

## Features

| Module | Description |
|---|---|
| **Multi-School** | Single instance hosts multiple schools; each school is isolated |
| **User Management** | Create/manage school admins, teachers, students, and parents |
| **Attendance** | Daily student attendance, teacher attendance, corrections & regularization |
| **Timetable** | Class-wise timetable builder with section/subject/teacher assignment |
| **Results & Assessments** | Formal exam results, class test marks, multi-level approval workflow |
| **Aptitude Exams** | Online timed exams with anti-cheat, analytics, and approval workflow |
| **Holiday Management** | School holiday calendar with CSV import/export, notifications, and audit log |
| **Notifications** | Real-time notifications via SSE, bell icon, browser push, and email |
| **Reports** | Downloadable PDF/XLSX reports for results and attendance |
| **Profile Management** | Profile images, qualification, contact details for all roles |
| **Dashboard Calendar** | Mini monthly calendar on every dashboard with upcoming holidays |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (CommonJS) |
| Framework | Express 5 |
| Database | MongoDB (via Mongoose 9) |
| Templating | EJS 5 + express-ejs-layouts |
| Auth | Session-based (express-session) + JWT (magic login links) |
| Email | Nodemailer (SMTP / Gmail) |
| File Uploads | Multer |
| Import/Export | xlsx (Excel), PDFKit (PDF) |
| Password Hashing | bcryptjs |
| Dev Server | nodemon |

---

## User Roles

```
super_admin
    └── Creates and manages schools + school admins
        └── school_admin
                └── Creates teachers, students, parents; manages all school data
                    ├── teacher      — Classroom management, attendance, marks entry
                    ├── student      — Views own timetable, results, attendance
                    └── parent       — Views child's results, attendance, holidays
```

Each role has a dedicated dashboard, route group, and navigation menu. Module access is gated per-school by the super admin.

---

## Module System

Every school starts with **all modules disabled**. The super admin enables them individually per school via **Super Admin → Module Permissions**.

| Module Key | What it unlocks |
|---|---|
| `attendance` | Attendance marking, correction, analytics |
| `notification` | Bell icon, real-time SSE notifications, email alerts |
| `aptitudeExam` | Online exam builder and proctoring |
| `result` | Formal exam & class test results with approval workflow |
| `timetable` | Timetable builder and viewer |
| `holiday` | Holiday calendar, import/export, dashboard widget |

---

## Project Structure

```
school-2.0/
├── app.js                  # Express app setup, middleware, routes
├── server.js               # HTTP server entry point
├── .env                    # Environment variables (create from .env.example)
│
├── config/
│   ├── db.js               # MongoDB connection
│   └── mailer.js           # Nodemailer transporter
│
├── controllers/            # Business logic (one file per role/module)
│   ├── adminController.js
│   ├── teacherController.js
│   ├── studentController.js
│   ├── parentController.js
│   ├── superAdminController.js
│   ├── holidayController.js
│   ├── attendanceController.js
│   ├── timetableController.js
│   └── ...
│
├── middleware/
│   ├── auth.js             # isAuthenticated, requireRole, loadUser
│   ├── requireModule.js    # Per-school module gate
│   ├── upload.js           # Multer (images)
│   └── uploadCsv.js        # Multer (CSV/XLSX)
│
├── models/                 # Mongoose schemas (34 models)
│   ├── User.js
│   ├── School.js           # Includes modules feature flags
│   ├── Holiday.js
│   ├── Attendance.js
│   ├── Timetable.js
│   ├── FormalExam.js
│   └── ...
│
├── routes/                 # Express routers (one per role)
│   ├── auth.js
│   ├── admin.js
│   ├── teacher.js
│   ├── student.js
│   ├── parent.js
│   ├── superAdmin.js
│   ├── profile.js
│   └── notifications.js
│
├── views/                  # EJS templates
│   ├── layouts/main.ejs    # Base layout (sidebar, topbar, notifications)
│   ├── partials/           # Shared partials (dashboard-calendar, etc.)
│   ├── admin/
│   ├── teacher/
│   ├── student/
│   ├── parent/
│   ├── superAdmin/
│   └── auth/
│
├── public/
│   ├── css/style.css
│   ├── js/main.js
│   └── images/
│
├── utils/
│   ├── generatePassword.js
│   ├── sendEmail.js
│   └── sseClients.js       # Server-sent events for real-time notifications
│
└── scripts/
    └── seed.js             # Creates the initial Super Admin account
```

---

## Prerequisites

Make sure the following are installed on your machine:

| Tool | Minimum Version | Download |
|---|---|---|
| Node.js | v18.x or later | https://nodejs.org |
| npm | v9.x or later | Included with Node.js |
| MongoDB | v6.x or later | https://www.mongodb.com/try/download/community |
| Git | Any recent version | https://git-scm.com |

> **MongoDB Atlas (cloud)** can be used instead of a local MongoDB installation. See [Database Setup](#database-setup) for both options.

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/school-management-system.git
cd school-management-system
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the environment file

Copy the example below into a new file named `.env` in the project root:

```bash
cp .env.example .env   # if the example file exists, otherwise create manually
```

Then edit `.env` with your own values — see [Environment Variables](#environment-variables) for details.

### 4. Set up the database

See [Database Setup](#database-setup) below.

### 5. Seed the Super Admin account

```bash
npm run seed
```

This creates the first super admin account. You will see the credentials printed in the terminal.

### 6. Start the server

```bash
# Development (auto-restarts on file changes)
npm run dev

# Production
npm start
```

The app will be available at **http://localhost:3000** (or whatever `PORT` you set in `.env`).

---

## Environment Variables

Create a `.env` file in the project root with the following keys:

```env
# ── Server ─────────────────────────────────────────────────
PORT=3000
APP_URL=http://localhost:3000
APP_NAME=School Management System

# ── MongoDB ────────────────────────────────────────────────
# Local MongoDB
MONGO_URI=mongodb://localhost:27017/school_management

# OR MongoDB Atlas (replace with your connection string)
# MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/school_management?retryWrites=true&w=majority

# ── Session & JWT ──────────────────────────────────────────
# Use long, random strings in production (min 32 characters)
SESSION_SECRET=change_this_to_a_long_random_string
JWT_SECRET=change_this_to_another_long_random_string

# ── Email / SMTP ───────────────────────────────────────────
# Gmail example (requires an App Password — not your login password)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
EMAIL_FROM=School Management <your_gmail@gmail.com>
```

### Generating a Gmail App Password

1. Go to your Google Account → **Security**
2. Enable **2-Step Verification** (required)
3. Go to **Security → App Passwords**
4. Select app: **Mail**, device: **Other** → name it "School App"
5. Copy the 16-character password into `SMTP_PASS`

### Generating secure secrets

```bash
# Linux / macOS
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Run twice — once for SESSION_SECRET, once for JWT_SECRET
```

---

## Database Setup

### Option A — Local MongoDB

1. **Install MongoDB Community Server** from https://www.mongodb.com/try/download/community

2. **Start the MongoDB service:**

   ```bash
   # macOS (Homebrew)
   brew services start mongodb-community

   # Ubuntu / Debian
   sudo systemctl start mongod
   sudo systemctl enable mongod   # auto-start on boot

   # Windows
   # MongoDB runs as a Windows Service automatically after installation
   ```

3. **Verify it is running:**

   ```bash
   mongosh
   # Should connect and show a prompt: test>
   ```

4. Set `MONGO_URI=mongodb://localhost:27017/school_management` in your `.env`.

   > The database `school_management` is created automatically on first connection — no manual database creation needed.

### Option B — MongoDB Atlas (Cloud)

1. Sign up at https://cloud.mongodb.com (free tier available)
2. Create a new **Project** → create a **Cluster** (M0 Free Tier is sufficient)
3. Under **Database Access** → add a database user with **read/write** access
4. Under **Network Access** → add your IP address (or `0.0.0.0/0` for development)
5. Click **Connect** → **Connect your application** → copy the connection string
6. Replace `<username>`, `<password>`, and the cluster URL in your `.env`:

   ```env
   MONGO_URI=mongodb+srv://myuser:mypassword@cluster0.abcde.mongodb.net/school_management?retryWrites=true&w=majority
   ```

---

## Running the App

| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon (development, auto-restart) |
| `npm start` | Start with plain Node.js (production) |
| `npm run seed` | Create the Super Admin account (run once) |

---

## First Login Flow

```
1. Run:  npm run seed
         → Prints email & temporary password

2. Open: http://localhost:3000/auth/login
         → Log in with the seeded credentials

3. You are redirected to /auth/reset-password
         → Set a new permanent password (required on first login)

4. As Super Admin you can now:
         a. Create a School  (Super Admin → Schools → Add School)
         b. Create a School Admin for that school
         c. Enable modules for that school (Super Admin → Module Permissions)

5. Log in as School Admin to:
         a. Create Teachers, Students, Parents
         b. Set up Classes, Sections, Subjects, Academic Years
         c. Manage Holidays, Timetable, Results, Exams (if modules are enabled)
```

---

## Default Credentials

After running `npm run seed`:

| Field | Value |
|---|---|
| Email | `superadmin@school.com` |
| Password | `SuperAdmin@123` |
| Role | Super Admin |

> **You will be forced to change this password on first login.**
> All other users (school admins, teachers, students, parents) are created through the application UI by the super admin or school admin. They receive a system-generated password via email and must also reset it on first login.

---

## Key URLs

| URL | Description |
|---|---|
| `GET /` | Redirects to login or role dashboard |
| `GET /auth/login` | Login page |
| `GET /super-admin/dashboard` | Super Admin dashboard |
| `GET /admin/dashboard` | School Admin dashboard |
| `GET /teacher/dashboard` | Teacher dashboard |
| `GET /student/dashboard` | Student dashboard |
| `GET /parent/dashboard` | Parent dashboard |
| `GET /super-admin/permissions` | Enable/disable per-school modules |
| `GET /admin/holidays` | Holiday management (requires holiday module) |
| `GET /notifications/sse` | Server-sent events stream for real-time notifications |

---

## Notes

- **Sessions** are stored in-memory by default. For production, use a persistent session store (e.g., `connect-mongo`).
- **File uploads** (profile images, CSV imports) are stored in `public/uploads/`. Ensure this directory is writable.
- The seed script is **idempotent** — running it again when a super admin already exists will print the existing email and exit without making changes.
- All passwords are hashed with **bcrypt** (12 salt rounds). Plain-text passwords are never stored.
