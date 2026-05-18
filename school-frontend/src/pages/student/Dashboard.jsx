import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules, getHolidays, getSchoolConfig } from '../../api/student.api';
import { Spinner, MiniCalendar } from '../../components/ui/index';

const ALL_QUICK_LINKS = [
  { to: '/student/my-class',   icon: '🏛️', label: 'My Class',      color: '#dbeafe' },
  { to: '/student/timetable',  icon: '🕐', label: 'Timetable',     color: '#d1fae5', module: 'timetable' },
  { to: '/student/attendance', icon: '✅', label: 'My Attendance', color: '#fef3c7', module: 'attendance' },
  { to: '/student/exams',      icon: '📝', label: 'Exams',          color: '#ede9fe', module: 'aptitudeExam' },
  { to: '/student/results',    icon: '📊', label: 'Results',        color: '#ffedd5', module: 'result' },
  { to: '/student/fees',       icon: '💰', label: 'My Fees',        color: '#d1fae5', module: 'fees' },
  { to: '/student/library',    icon: '📖', label: 'Library',        color: '#ccfbf1', module: 'library' },
  { to: '/student/documents',  icon: '📁', label: 'Documents',      color: '#fee2e2', module: 'document' },
];

export default function StudentDashboard() {
  const { user }                               = useAuth();
  const { loading: dashLoading }               = useFetch(getDashboard);
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Hello, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">Student Portal</p>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* Quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 12 }}>
          {quickLinks.map(l => (
            <Link key={l.to} to={l.to}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: l.color, borderRadius: 'var(--radius-lg)', padding: '20px 12px',
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
          holidayListPath={modules?.holiday ? '/student/holidays' : ''}
          saturdayConfig={saturdayConfig}
        />
      </div>
    </div>
  );
}
