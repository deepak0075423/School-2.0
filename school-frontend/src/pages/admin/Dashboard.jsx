import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules, getMyHolidays, getSchoolSettings, getMyAttendance, clockIn, clockOut } from '../../api/admin.api';
import { StatCard, Spinner, MiniCalendar } from '../../components/ui/index';
import ClockCard from '../../components/attendance/ClockCard';

const ALL_MODULES = [
  { key: 'fees',         to: '/admin/fees/dashboard',    icon: '💰', label: 'Fees Management',  color: '#dbeafe' },
  { key: 'payroll',      to: '/admin/payroll/dashboard', icon: '💵', label: 'Payroll',           color: '#d1fae5' },
  { key: 'library',      to: '/admin/library/dashboard', icon: '📖', label: 'Library',           color: '#fef3c7' },
  { key: 'leave',        to: '/admin/leave',             icon: '🏖️', label: 'Leave Management',  color: '#ede9fe' },
  { key: 'aptitudeExam', to: '/admin/exams',             icon: '📝', label: 'Aptitude Exams',    color: '#fce7f3' },
  { key: 'result',       to: '/admin/results',           icon: '📊', label: 'Results',           color: '#f0fdf4' },
  { key: 'attendance',   to: '/admin/attendance',        icon: '✅', label: 'Attendance',        color: '#ecfdf5' },
  { key: 'timetable',    to: '/admin/timetable',         icon: '📅', label: 'Timetable',         color: '#eff6ff' },
  { key: 'document',     to: '/admin/documents',         icon: '📁', label: 'Documents',         color: '#ffedd5' },
  { key: 'holiday',      to: '/admin/holidays',          icon: '🎉', label: 'Holidays',          color: '#ccfbf1' },
  { key: 'notification', to: '/admin/notifications',     icon: '🔔', label: 'Notifications',     color: '#fee2e2' },
  { key: 'chat',         to: '/chat',                    icon: '💬', label: 'Chat',              color: '#e0e7ff' },
];

// Pending queues that need the admin's attention
const PENDING_ITEMS = [
  { key: 'payments',        module: 'fees',       to: '/admin/fees/payments',   icon: '💳', label: 'Fee payments to verify' },
  { key: 'leaves',          module: 'leave',      to: '/admin/leave',           icon: '🏖️', label: 'Leave requests to review' },
  { key: 'examsToPublish',  module: 'result',     to: '/admin/results',         icon: '📊', label: 'Results ready to publish' },
  { key: 'regularizations', module: 'attendance', to: '/admin/attendance',      icon: '✅', label: 'Attendance regularizations' },
];

export default function AdminDashboard() {
  const { user }                                   = useAuth();
  const { data: stats,   loading: statsLoading  }  = useFetch(getDashboard);
  const { data: modules, loading: modulesLoading } = useFetch(getModules);
  const { data: schoolData }                       = useFetch(getSchoolSettings);
  const [holidays, setHolidays]                    = useState([]);
  const [attDays,  setAttDays]                     = useState([]);

  const loadAttendance = () => {
    const n = new Date();
    getMyAttendance({ month: n.getMonth() + 1, year: n.getFullYear() })
      .then(r => setAttDays((r.data ?? r)?.days || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (!modules?.attendance) { setAttDays([]); return; }
    loadAttendance();
  }, [modules]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!modules) return;
    if (!modules.holiday) { setHolidays([]); return; }
    getMyHolidays().then(r => setHolidays(r.data ?? r ?? [])).catch(() => {});
  }, [modules]);

  if (statsLoading || modulesLoading) return <div className="loading-page"><Spinner /></div>;

  const enabledModules = ALL_MODULES.filter(m => modules?.[m.key]);
  const ls             = schoolData?.leaveSettings;
  const saturdayConfig = ls
    ? { working: ls.saturdayWorking !== false, mode: ls.saturdayMode || 'all', halfDay: !!ls.saturdayHalfDay }
    : modules?.saturdayConfig;

  const pendingItems = PENDING_ITEMS
    .filter(p => (!p.module || modules?.[p.module]) && (stats?.pending?.[p.key] || 0) > 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Hello, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">School management overview</p>
        </div>
      </div>

      <div className="dashboard-layout">
        <div>
          {/* Clock in/out — today */}
          {modules?.attendance && (
            <ClockCard api={{ getMyAttendance, clockIn, clockOut }} linkTo="/admin/attendance" onChanged={loadAttendance} />
          )}

          {/* Stats */}
          <div className="stat-grid">
            <StatCard icon="👨‍🏫" label="Teachers" value={stats?.teachers ?? 0} color="blue"   />
            <StatCard icon="👨‍🎓" label="Students" value={stats?.students ?? 0} color="green"  />
            <StatCard icon="👨‍👩‍👧" label="Parents"  value={stats?.parents ?? 0}  color="orange" />
            <StatCard icon="🏛️" label="Sections" value={stats?.sections ?? 0} color="purple" />
          </div>

          {/* Needs attention */}
          {pendingItems.length > 0 && (
            <>
              <h2 style={{ marginBottom: 14, marginTop: 24, fontSize: '1rem', fontWeight: 600 }}>⚡ Needs your attention</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 12 }}>
                {pendingItems.map(p => (
                  <Link key={p.key} to={p.to} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    border: '1px solid var(--border)', borderLeft: '4px solid var(--warning, #f59e0b)',
                    borderRadius: 'var(--radius)', padding: '12px 16px',
                    textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)',
                  }}>
                    <span style={{ fontSize: '1.3rem' }}>{p.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{stats.pending[p.key]} {p.label}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Click to review →</div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Enabled modules quick access */}
          {enabledModules.length > 0 && (
            <>
              <h2 style={{ marginBottom: 14, marginTop: 24, fontSize: '1rem', fontWeight: 600 }}>Quick Access</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px,1fr))', gap: 12 }}>
                {enabledModules.map(m => (
                  <Link key={m.to} to={m.to}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: m.color, borderRadius: 'var(--radius-lg)', padding: '14px 16px',
                      textDecoration: 'none', color: 'var(--text)', fontWeight: 500,
                      transition: 'transform .15s, box-shadow .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                  >
                    <span style={{ fontSize: '1.4rem' }}>{m.icon}</span>
                    <span style={{ fontSize: '.88rem' }}>{m.label}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Recent notifications */}
          {(stats?.recentNotifications || []).length > 0 && (
            <>
              <h2 style={{ marginBottom: 14, marginTop: 24, fontSize: '1rem', fontWeight: 600 }}>Recent notifications sent</h2>
              <div className="card"><div className="card-body" style={{ padding: '4px 16px' }}>
                {stats.recentNotifications.map(n => (
                  <div key={n._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔔 {n.title}</span>
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {n.recipientCount ?? 0} recipients · {new Date(n.createdAt).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                ))}
              </div></div>
            </>
          )}
        </div>

        {/* Calendar */}
        <MiniCalendar
          holidays={holidays}
          attendance={attDays}
          holidayListPath={modules?.holiday ? '/admin/holidays' : ''}
          saturdayConfig={saturdayConfig}
        />
      </div>
    </div>
  );
}
