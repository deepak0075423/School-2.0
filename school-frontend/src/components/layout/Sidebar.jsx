import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getModules as getAdminModules }   from '../../api/admin.api';
import { getModules as getTeacherModules } from '../../api/teacher.api';
import { getModules as getStudentModules } from '../../api/student.api';
import { getModules as getParentModules }  from '../../api/parent.api';

const Icon = ({ name }) => <span className="sidebar__link-icon">{name}</span>;

const SUPER_ADMIN_NAV = [
  { section: 'Overview' },
  { to: '/super-admin/dashboard',   icon: '🏠', label: 'Dashboard' },
  { section: 'Management' },
  { to: '/super-admin/schools',     icon: '🏫', label: 'Schools' },
  { to: '/super-admin/users',       icon: '👥', label: 'Users' },
  { to: '/super-admin/permissions', icon: '🔑', label: 'Permissions' },
  { section: 'System' },
  { to: '/super-admin/notifications', icon: '🔔', label: 'Notifications' },
  { to: '/profile',                   icon: '👤', label: 'Profile' },
];

const ADMIN_NAV = [
  { section: 'Overview' },
  { to: '/admin/dashboard',         icon: '🏠', label: 'Dashboard' },
  { section: 'People' },
  { to: '/admin/teachers',          icon: '👨‍🏫', label: 'Teachers' },
  { to: '/admin/students',          icon: '👨‍🎓', label: 'Students' },
  { to: '/admin/admins',            icon: '👤', label: 'Admins' },
  { section: 'Academics' },
  { to: '/admin/academic-years',    icon: '📅', label: 'Academic Years' },
  { to: '/admin/classes',           icon: '🏛️', label: 'Classes' },
  { to: '/admin/subjects',          icon: '📚', label: 'Subjects' },
  { to: '/admin/timetable',         icon: '🕐', label: 'Timetable',     module: 'timetable' },
  { to: '/admin/results',           icon: '📊', label: 'Results',       module: 'result' },
  { to: '/admin/attendance',        icon: '✅', label: 'Attendance',    module: 'attendance' },
  { section: 'Modules' },
  { to: '/admin/fees/dashboard',    icon: '💰', label: 'Fees',          module: 'fees' },
  { to: '/admin/payroll/dashboard', icon: '💵', label: 'Payroll',       module: 'payroll' },
  { to: '/admin/library/dashboard', icon: '📖', label: 'Library',       module: 'library' },
  { to: '/admin/leave',             icon: '🏖️', label: 'Leave',         module: 'leave' },
  { to: '/admin/documents',         icon: '📁', label: 'Documents',     module: 'document' },
  { to: '/admin/holidays',          icon: '🎉', label: 'Holidays',      module: 'holiday' },
  { to: '/admin/notifications',     icon: '🔔', label: 'Notifications', module: 'notification' },
  { to: '/admin/reports',           icon: '📈', label: 'Reports' },
  { section: 'Account' },
  { to: '/profile',                 icon: '👤', label: 'Profile' },
];

const TEACHER_NAV = [
  { section: 'Overview' },
  { to: '/teacher/dashboard',       icon: '🏠', label: 'Dashboard' },
  { section: 'My Class' },
  { to: '/teacher/my-section',      icon: '🏛️', label: 'My Section' },
  { to: '/teacher/attendance',      icon: '✅', label: 'Attendance',    module: 'attendance' },
  { to: '/teacher/timetable',       icon: '🕐', label: 'Timetable',     module: 'timetable' },
  { section: 'Academics' },
  { to: '/teacher/exams',           icon: '📝', label: 'Aptitude Exams', module: 'aptitudeExam' },
  { to: '/teacher/results',         icon: '📊', label: 'Results',       module: 'result' },
  { section: 'Modules' },
  { to: '/teacher/leave',           icon: '🏖️', label: 'My Leave',      module: 'leave' },
  { to: '/teacher/documents',       icon: '📁', label: 'Documents',     module: 'document' },
  { to: '/teacher/payroll/ctc',     icon: '💵', label: 'Payroll',       module: 'payroll' },
  { to: '/teacher/library',         icon: '📖', label: 'Library',       module: 'library' },
  { to: '/teacher/holidays',        icon: '🎉', label: 'Holidays',      module: 'holiday' },
  { to: '/teacher/notifications',   icon: '🔔', label: 'Notifications', module: 'notification' },
  { section: 'Account' },
  { to: '/profile',                 icon: '👤', label: 'Profile' },
];

const STUDENT_NAV = [
  { section: 'Overview' },
  { to: '/student/dashboard',       icon: '🏠', label: 'Dashboard' },
  { section: 'Academics' },
  { to: '/student/my-class',        icon: '🏛️', label: 'My Class' },
  { to: '/student/timetable',       icon: '🕐', label: 'Timetable',     module: 'timetable' },
  { to: '/student/attendance',      icon: '✅', label: 'Attendance',    module: 'attendance' },
  { to: '/student/exams',           icon: '📝', label: 'Exams',         module: 'aptitudeExam' },
  { to: '/student/results',         icon: '📊', label: 'Results',       module: 'result' },
  { section: 'Resources' },
  { to: '/student/documents',       icon: '📁', label: 'Documents',     module: 'document' },
  { to: '/student/holidays',        icon: '🎉', label: 'Holidays',      module: 'holiday' },
  { to: '/student/fees',            icon: '💰', label: 'Fees',          module: 'fees' },
  { to: '/student/library',         icon: '📖', label: 'Library',       module: 'library' },
  { to: '/student/notifications',   icon: '🔔', label: 'Notifications', module: 'notification' },
  { section: 'Account' },
  { to: '/profile',                 icon: '👤', label: 'Profile' },
];

const PARENT_NAV = [
  { section: 'Overview' },
  { to: '/parent/dashboard',        icon: '🏠', label: 'Dashboard' },
  { section: "My Child" },
  { to: '/parent/child-class',      icon: '🏛️', label: 'Class Info' },
  { to: '/parent/child-attendance', icon: '✅', label: 'Attendance',    module: 'attendance' },
  { to: '/parent/exams',            icon: '📝', label: 'Exams',         module: 'aptitudeExam' },
  { to: '/parent/results',          icon: '📊', label: 'Results',       module: 'result' },
  { section: 'Resources' },
  { to: '/parent/documents',        icon: '📁', label: 'Documents',     module: 'document' },
  { to: '/parent/holidays',         icon: '🎉', label: 'Holidays',      module: 'holiday' },
  { to: '/parent/child-fees',       icon: '💰', label: 'Fees',          module: 'fees' },
  { to: '/parent/notifications',    icon: '🔔', label: 'Notifications', module: 'notification' },
  { section: 'Account' },
  { to: '/profile',                 icon: '👤', label: 'Profile' },
];

const NAV_MAP = {
  super_admin:  SUPER_ADMIN_NAV,
  school_admin: ADMIN_NAV,
  teacher:      TEACHER_NAV,
  student:      STUDENT_NAV,
  parent:       PARENT_NAV,
};

const MODULE_FETCHER = {
  school_admin: getAdminModules,
  teacher:      getTeacherModules,
  student:      getStudentModules,
  parent:       getParentModules,
};

export default function Sidebar({ onLinkClick, collapsed }) {
  const { user } = useAuth();
  const [modules, setModules]       = useState(null);
  const [modulesReady, setModulesReady] = useState(false);

  useEffect(() => {
    const fetcher = MODULE_FETCHER[user?.role];
    if (!fetcher) { setModulesReady(true); return; }
    fetcher()
      .then(res => setModules(res.data ?? res))
      .catch(() => {})
      .finally(() => setModulesReady(true));
  }, [user?.role]);

  const rawNav = NAV_MAP[user?.role] || [];
  // While loading show everything; once ready filter by enabled flags
  const nav = (modulesReady && modules)
    ? rawNav.filter(item => !item.module || modules[item.module])
    : rawNav;

  return (
    <nav className="sidebar">
      <div className="sidebar__logo">
        <span style={{ fontSize: '1.8rem' }}>🏫</span>
        {!collapsed && <span>School MS</span>}
      </div>

      <div className="sidebar__nav">
        {nav.map((item, i) => {
          if (item.section) {
            return collapsed ? null : (
              <div key={i} className="sidebar__section-title">{item.section}</div>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar__link${isActive ? ' active' : ''}`}
              onClick={onLinkClick}
              title={collapsed ? item.label : undefined}
            >
              <Icon name={item.icon} />
              {!collapsed && <span className="sidebar__link-text">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="sidebar__badge">{item.badge}</span>
              )}
            </NavLink>
          );
        })}
      </div>

      {!collapsed && (
        <div className="sidebar__footer">
          <div className="sidebar__link" style={{ cursor: 'default' }}>
            <div className="avatar avatar-sm" style={{ background: 'rgba(255,255,255,.2)', fontSize: user?.profileIcon ? '1rem' : '.85rem' }}>
              {user?.profileIcon ? user.profileIcon : user?.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ color: '#fff', fontSize: '.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.75rem', textTransform: 'capitalize' }}>
                {user?.role?.replace('_', ' ')}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
