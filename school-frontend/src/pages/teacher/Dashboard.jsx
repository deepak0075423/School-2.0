import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules, getHolidays, getMyLeaves, getSchoolConfig, getMyAttendance, clockIn, clockOut } from '../../api/teacher.api';
import { Spinner, MiniCalendar, StatCard } from '../../components/ui/index';
import { useAuth } from '../../contexts/AuthContext';
import ClockCard from '../../components/attendance/ClockCard';

const ALL_QUICK_LINKS = [
  { to: '/teacher/my-section',  icon: '🏛️', label: 'My Section',      color: '#dbeafe' },
  { to: '/teacher/attendance',  icon: '✅', label: 'Attendance',      color: '#d1fae5', module: 'attendance' },
  { to: '/teacher/timetable',   icon: '🕐', label: 'My Timetable',   color: '#fef3c7', module: 'timetable' },
  { to: '/teacher/exams',       icon: '📝', label: 'Aptitude Exams', color: '#ede9fe', module: 'aptitudeExam' },
  { to: '/teacher/results',     icon: '📊', label: 'Results',         color: '#ffedd5', module: 'result' },
  { to: '/teacher/leave',       icon: '🏖️', label: 'My Leave',       color: '#fee2e2', module: 'leave' },
  { to: '/teacher/documents',   icon: '📁', label: 'Documents',       color: '#ccfbf1', module: 'document' },
  { to: '/teacher/payroll/ctc', icon: '💵', label: 'My Salary',      color: '#f0fdf4', module: 'payroll' },
  { to: '/teacher/library',     icon: '📖', label: 'Library',         color: '#fce7f3', module: 'library' },
  { to: '/chat',                icon: '💬', label: 'Chat',            color: '#e0e7ff', module: 'chat' },
];

export default function TeacherDashboard() {
  const { user }                                 = useAuth();
  const { data: dash, loading: dashLoading }     = useFetch(getDashboard);
  const { data: modules, loading: modLoading }   = useFetch(getModules);
  const { data: schoolConfig }                   = useFetch(getSchoolConfig);
  const [holidays, setHolidays] = useState([]);
  const [leaves,   setLeaves]   = useState([]);
  const [attDays,  setAttDays]  = useState([]);

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
    getHolidays().then(r => setHolidays(r.data ?? r ?? [])).catch(() => {});
  }, [modules]);

  useEffect(() => {
    if (!modules) return;
    if (!modules.leave) { setLeaves([]); return; }
    getMyLeaves().then(r => {
      const data = r.data ?? r ?? [];
      setLeaves(Array.isArray(data) ? data.filter(l => ['approved', 'pending', 'modification_requested'].includes(l.status)) : []);
    }).catch(() => {});
  }, [modules]);

  if (dashLoading || modLoading) return <div className="loading-page"><Spinner /></div>;

  const quickLinks     = ALL_QUICK_LINKS.filter(l => !l.module || modules?.[l.module]);
  const saturdayConfig = schoolConfig
    ? { working: schoolConfig.saturdayWorking, mode: schoolConfig.saturdayMode, halfDay: schoolConfig.saturdayHalfDay }
    : modules?.saturdayConfig;

  const section      = dash?.mySection;
  const todayPeriods = dash?.todayPeriods || [];
  const pending      = dash?.pending || {};

  const pendingItems = [
    modules?.attendance && pending.corrections > 0 && {
      to: '/teacher/attendance', icon: '✅',
      text: `${pending.corrections} attendance correction request${pending.corrections !== 1 ? 's' : ''} to review`,
    },
    modules?.result && pending.validation > 0 && {
      to: '/teacher/results', icon: '📊',
      text: `${pending.validation} exam${pending.validation !== 1 ? 's' : ''} awaiting your marks validation`,
    },
  ].filter(Boolean);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Welcome, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">Teacher Dashboard</p>
        </div>
      </div>

      <div className="dashboard-layout">
        <div>
          {/* Clock in/out — today */}
          {modules?.attendance && (
            <ClockCard api={{ getMyAttendance, clockIn, clockOut }} linkTo="/teacher/attendance" onChanged={loadAttendance} />
          )}

          {/* Stats */}
          <div className="stat-grid">
            {section && (
              <StatCard icon="🏛️" label="My Section"
                value={`${section.className ? section.className + ' — ' : ''}${section.sectionName}`} color="blue" />
            )}
            {section && <StatCard icon="🧑‍🎓" label="My Students" value={section.studentCount} color="green" />}
            <StatCard icon="🕐" label="Periods Today" value={todayPeriods.length} color="orange" />
            {modules?.leave && <StatCard icon="🏖️" label="Leave Balance" value={`${dash?.leaveRemaining ?? 0} days`} color="purple" />}
          </div>

          {/* Needs attention */}
          {pendingItems.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12, marginTop: 20 }}>
              {pendingItems.map((p, i) => (
                <Link key={i} to={p.to} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  border: '1px solid var(--border)', borderLeft: '4px solid var(--warning, #f59e0b)',
                  borderRadius: 'var(--radius)', padding: '12px 16px',
                  textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)',
                }}>
                  <span style={{ fontSize: '1.3rem' }}>{p.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{p.text}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Click to review →</div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Today's schedule */}
          {modules?.timetable && todayPeriods.length > 0 && (
            <>
              <h2 style={{ marginBottom: 14, marginTop: 24, fontSize: '1rem', fontWeight: 600 }}>🕐 Today's classes</h2>
              <div className="card"><div className="card-body" style={{ padding: '4px 16px' }}>
                {todayPeriods.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{
                      width: 34, height: 34, borderRadius: 8, background: 'var(--bg-secondary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.85rem', flexShrink: 0,
                    }}>P{p.periodNumber}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{p.subject || 'Class'}</div>
                      <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{p.section}</div>
                    </div>
                  </div>
                ))}
              </div></div>
            </>
          )}

          {/* Quick links */}
          <h2 style={{ marginBottom: 14, marginTop: 24, fontSize: '1rem', fontWeight: 600 }}>Quick Access</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
            {quickLinks.map(l => (
              <Link key={l.to} to={l.to}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: l.color, borderRadius: 'var(--radius-lg)', padding: '18px 12px',
                  textDecoration: 'none', color: 'var(--text)', gap: 8,
                  transition: 'transform .15s, box-shadow .15s', textAlign: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <span style={{ fontSize: '1.6rem' }}>{l.icon}</span>
                <span style={{ fontWeight: 500, fontSize: '.82rem' }}>{l.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <MiniCalendar
          holidays={holidays}
          leaves={leaves}
          attendance={attDays}
          holidayListPath={modules?.holiday ? '/teacher/holidays' : ''}
          saturdayConfig={saturdayConfig}
        />
      </div>
    </div>
  );
}
