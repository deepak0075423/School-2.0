import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getModules, getHolidays, getSchoolConfig } from '../../api/parent.api';
import { Spinner, MiniCalendar } from '../../components/ui/index';

const ALL_QUICK_LINKS = [
  { to: '/parent/child-class',      icon: '🏛️', label: "Child's Class", color: '#dbeafe' },
  { to: '/parent/child-attendance', icon: '✅', label: 'Attendance',    color: '#d1fae5', module: 'attendance' },
  { to: '/parent/exams',            icon: '📝', label: 'Exams',          color: '#ede9fe', module: 'aptitudeExam' },
  { to: '/parent/results',          icon: '📊', label: 'Results',        color: '#ffedd5', module: 'result' },
  { to: '/parent/child-fees',       icon: '💰', label: 'Fees',           color: '#fef3c7', module: 'fees' },
  { to: '/parent/documents',        icon: '📁', label: 'Documents',      color: '#fee2e2', module: 'document' },
];

export default function ParentDashboard() {
  const { user }                               = useAuth();
  const { data, loading: dashLoading }         = useFetch(getDashboard);
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
          <p className="text-muted">Parent Portal</p>
        </div>
      </div>

      {/* Child info card */}
      {data?.child && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>👦</div>
              <div>
                <strong style={{ fontSize: '1.05rem' }}>{data.child.name}</strong>
                <p className="text-muted text-sm" style={{ margin: 0 }}>{data.child.class} • {data.child.section}</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
          holidayListPath={modules?.holiday ? '/parent/holidays' : ''}
          saturdayConfig={saturdayConfig}
        />
      </div>
    </div>
  );
}
