import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules, getHolidays, getMyLeaves } from '../../api/teacher.api';
import { Spinner, MiniCalendar } from '../../components/ui/index';
import { useAuth } from '../../contexts/AuthContext';

const ALL_QUICK_LINKS = [
  { to: '/teacher/my-section',  icon: '🏛️', label: 'My Section',      color: '#dbeafe' },
  { to: '/teacher/attendance',  icon: '✅', label: 'Attendance',      color: '#d1fae5', module: 'attendance' },
  { to: '/teacher/timetable',   icon: '🕐', label: 'My Timetable',   color: '#fef3c7', module: 'timetable' },
  { to: '/teacher/exams',       icon: '📝', label: 'Aptitude Exams', color: '#ede9fe', module: 'aptitudeExam' },
  { to: '/teacher/results',     icon: '📊', label: 'Results',         color: '#ffedd5', module: 'result' },
  { to: '/teacher/leave',       icon: '🏖️', label: 'My Leave',       color: '#fee2e2', module: 'leave' },
  { to: '/teacher/documents',   icon: '📁', label: 'Documents',       color: '#ccfbf1', module: 'document' },
  { to: '/teacher/payroll/ctc', icon: '💵', label: 'My Salary',      color: '#f0fdf4', module: 'payroll' },
];

export default function TeacherDashboard() {
  const { user }                                 = useAuth();
  const { loading: dashLoading }                 = useFetch(getDashboard);
  const { data: modules, loading: modLoading }   = useFetch(getModules);
  const [holidays, setHolidays] = useState([]);
  const [leaves,   setLeaves]   = useState([]);

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

  const quickLinks = ALL_QUICK_LINKS.filter(l => !l.module || modules?.[l.module]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Welcome, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">Teacher Dashboard</p>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
          {quickLinks.map(l => (
            <Link key={l.to} to={l.to}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: l.color, borderRadius: 'var(--radius-lg)', padding: '22px 14px',
                textDecoration: 'none', color: 'var(--text)', gap: 8,
                transition: 'transform .15s, box-shadow .15s', textAlign: 'center',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              <span style={{ fontSize: '1.8rem' }}>{l.icon}</span>
              <span style={{ fontWeight: 500, fontSize: '.85rem' }}>{l.label}</span>
            </Link>
          ))}
        </div>

        {/* Calendar */}
        <MiniCalendar
          holidays={holidays}
          leaves={leaves}
          holidayListPath={modules?.holiday ? '/teacher/holidays' : ''}
        />
      </div>

    </div>
  );
}
