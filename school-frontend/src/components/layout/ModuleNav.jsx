import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

/**
 * Horizontal tab bar + outlet for module sections (Fees, Payroll, Library…).
 * Used as a nested layout route so every sub-page of a module is reachable
 * from anywhere inside it.
 *
 * tabs: [{ to: '/admin/fees/dashboard', label: 'Dashboard', end?: true }]
 */
export default function ModuleNav({ tabs }) {
  return (
    <>
      <div style={{ padding: '16px 24px 0', maxWidth: 1400 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
              style={{ textDecoration: 'none' }}>
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </>
  );
}

export const FEES_ADMIN_TABS = [
  { to: '/admin/fees/dashboard',    label: '🏠 Dashboard' },
  { to: '/admin/fees/student-fees', label: '🧑‍🎓 Student Fees' },
  { to: '/admin/fees/payments',     label: '💳 Payments' },
  { to: '/admin/fees/structures',   label: '🏗 Structures' },
  { to: '/admin/fees/heads',        label: '📋 Fee Heads' },
  { to: '/admin/fees/categories',   label: '🗂 Categories' },
  { to: '/admin/fees/concessions',  label: '🎁 Concessions' },
  { to: '/admin/fees/fine-rules',   label: '⚠️ Fine Rules' },
  { to: '/admin/fees/reports',      label: '📈 Reports' },
  { to: '/admin/fees/settings',     label: '⚙️ Settings' },
];

export const PAYROLL_ADMIN_TABS = [
  { to: '/admin/payroll/dashboard',   label: '🏠 Dashboard' },
  { to: '/admin/payroll/runs',        label: '💼 Payroll Runs' },
  { to: '/admin/payroll/assignments', label: '🧑‍🏫 Assignments' },
  { to: '/admin/payroll/structures',  label: '🏗 Structures' },
];

// Library management tabs — used by school admins (/admin/library) and by
// teachers with the Librarian designation (/teacher/manage-library)
export const LIBRARY_MANAGE_TABS = (base) => ([
  { to: `${base}/dashboard`,    label: '🏠 Dashboard' },
  { to: `${base}/books`,        label: '📚 Books' },
  { to: `${base}/circulation`,  label: '🔄 Circulation' },
  { to: `${base}/reservations`, label: '🔖 Reservations' },
  { to: `${base}/fines`,        label: '💸 Fines' },
  { to: `${base}/policy`,       label: '⚙️ Policy' },
]);

export const LIBRARY_ADMIN_TABS = LIBRARY_MANAGE_TABS('/admin/library');

export const LIBRARY_STUDENT_TABS = (base) => ([
  { to: `${base}/library`,          label: '🏠 Library', end: true },
  { to: `${base}/library/search`,   label: '🔍 Search Books' },
  { to: `${base}/library/my-books`, label: '📚 My Books' },
  { to: `${base}/library/my-fines`, label: '💸 My Fines' },
]);

export const PAYROLL_TEACHER_TABS = [
  { to: '/teacher/payroll/ctc',      label: '💼 My CTC' },
  { to: '/teacher/payroll/payslips', label: '📄 Salary Slips' },
];
