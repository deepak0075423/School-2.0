import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules, getHolidays, getSchoolConfig } from '../../api/student.api';
import { Spinner, MiniCalendar, StatCard } from '../../components/ui/index';

const ALL_QUICK_LINKS = [
  { to: '/student/my-class',   icon: '🏛️', label: 'My Class',      color: '#dbeafe' },
  { to: '/student/timetable',  icon: '🕐', label: 'Timetable',     color: '#d1fae5', module: 'timetable' },
  { to: '/student/attendance', icon: '✅', label: 'My Attendance', color: '#fef3c7', module: 'attendance' },
  { to: '/student/exams',      icon: '📝', label: 'Exams',          color: '#ede9fe', module: 'aptitudeExam' },
  { to: '/student/results',    icon: '📊', label: 'Results',        color: '#ffedd5', module: 'result' },
  { to: '/student/fees',       icon: '💰', label: 'My Fees',        color: '#d1fae5', module: 'fees' },
  { to: '/student/library',    icon: '📖', label: 'Library',        color: '#ccfbf1', module: 'library' },
  { to: '/student/documents',  icon: '📁', label: 'Documents',      color: '#fee2e2', module: 'document' },
  { to: '/chat',               icon: '💬', label: 'Chat',           color: '#e0e7ff', module: 'chat' },
];

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function StudentDashboard() {
  const { user }                               = useAuth();
  const { data: dash, loading: dashLoading }   = useFetch(getDashboard);
  const { data: modules, loading: modLoading } = useFetch(getModules);
  const { data: schoolConfig }                 = useFetch(getSchoolConfig);
  const [holidays, setHolidays]                = useState([]);

  useEffect(() => {
    if (!modules) return;
    if (!modules.holiday) { setHolidays([]); return; }
    getHolidays().then(r => setHolidays(r.data ?? r ?? [])).catch(() => {});
  }, [modules]);

  if (dashLoading || modLoading) return <div className="loading-page"><Spinner /></div>;

  const quickLinks     = ALL_QUICK_LINKS.filter(l => !l.module || modules?.[l.module]);
  const saturdayConfig = schoolConfig
    ? { working: schoolConfig.saturdayWorking, mode: schoolConfig.saturdayMode, halfDay: schoolConfig.saturdayHalfDay }
    : modules?.saturdayConfig;

  const section    = dash?.profile?.currentSection;
  const attendance = dash?.attendance;
  const feeBalance = dash?.feeBalance ?? 0;
  const upcoming   = dash?.upcomingExams || [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Hello, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">
            {section ? `${section.class?.className ? section.class.className + ' — ' : ''}${section.sectionName}` : 'Student Portal'}
            {dash?.profile?.rollNumber ? ` · Roll ${dash.profile.rollNumber}` : ''}
          </p>
        </div>
      </div>

      <div className="dashboard-layout">
        <div>
          {/* Stats */}
          <div className="stat-grid">
            {modules?.attendance && (
              <StatCard icon="✅" label="Attendance (this month)"
                value={attendance?.percentage != null ? `${attendance.percentage}%` : '—'}
                color={attendance?.percentage >= 75 ? 'green' : 'red'} />
            )}
            {modules?.aptitudeExam && <StatCard icon="📝" label="Upcoming Exams" value={upcoming.length} color="blue" />}
            {modules?.fees && (
              <StatCard icon="💰" label="Fees Due"
                value={feeBalance > 0 ? fmt(feeBalance) : '✓ Clear'}
                color={feeBalance > 0 ? 'red' : 'green'} />
            )}
          </div>

          {/* Fees due call-to-action */}
          {modules?.fees && feeBalance > 0 && (
            <Link to="/student/fees" style={{
              display: 'flex', alignItems: 'center', gap: 12, marginTop: 16,
              border: '1px solid var(--border)', borderLeft: '4px solid var(--danger, #ef4444)',
              borderRadius: 'var(--radius)', padding: '12px 16px',
              textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)',
            }}>
              <span style={{ fontSize: '1.3rem' }}>💳</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.9rem' }}>You have {fmt(feeBalance)} in pending fees</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Open your fee book to pay →</div>
              </div>
            </Link>
          )}

          {/* Upcoming exams */}
          {modules?.aptitudeExam && upcoming.length > 0 && (
            <>
              <h2 style={{ marginBottom: 14, marginTop: 24, fontSize: '1rem', fontWeight: 600 }}>📝 Upcoming exams</h2>
              <div className="card"><div className="card-body" style={{ padding: '4px 16px' }}>
                {upcoming.map(e => (
                  <Link key={e._id} to="/student/exams"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                    <span style={{ fontWeight: 600, fontSize: '.9rem' }}>{e.title}</span>
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {new Date(e.examDate).toLocaleDateString('en-IN')} · {e.startTime} · {e.duration} min
                    </span>
                  </Link>
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
          holidayListPath={modules?.holiday ? '/student/holidays' : ''}
          saturdayConfig={saturdayConfig}
        />
      </div>
    </div>
  );
}
