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
  { to: '/chat',                    icon: '💬', label: 'Chat',           color: '#e0e7ff', module: 'chat' },
];

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

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

  const children = data?.children || [];
  const totalDue = children.reduce((s, c) => s + Math.max(0, c.feeBalance || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Hello, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">Parent Portal</p>
        </div>
      </div>

      <div className="dashboard-layout">
        <div>
          {/* Children cards */}
          {children.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12, marginBottom: 8 }}>
              {children.map(c => (
                <div key={c._id} className="card">
                  <div className="card-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%', background: 'var(--primary)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '1.1rem', flexShrink: 0,
                      }}>{(c.name || '?')[0].toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                          {c.className ? `${c.className} — ` : ''}{c.sectionName || 'No section'}
                          {c.rollNumber ? ` · Roll ${c.rollNumber}` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.85rem' }}>
                      {modules?.attendance && (
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>Attendance (month)</div>
                          <strong style={{ color: c.attendancePercentage >= 75 ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)' }}>
                            {c.attendancePercentage != null ? `${c.attendancePercentage}%` : '—'}
                          </strong>
                        </div>
                      )}
                      {modules?.fees && (
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}>Fees due</div>
                          <strong style={{ color: c.feeBalance > 0 ? 'var(--danger, #ef4444)' : 'var(--success, #22c55e)' }}>
                            {c.feeBalance > 0 ? fmt(c.feeBalance) : 'Clear ✓'}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pay fees CTA */}
          {modules?.fees && totalDue > 0 && (
            <Link to="/parent/child-fees" style={{
              display: 'flex', alignItems: 'center', gap: 12, marginTop: 8,
              border: '1px solid var(--border)', borderLeft: '4px solid var(--danger, #ef4444)',
              borderRadius: 'var(--radius)', padding: '12px 16px',
              textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)',
            }}>
              <span style={{ fontSize: '1.3rem' }}>💳</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{fmt(totalDue)} in pending school fees</div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Open the fee book to pay online →</div>
              </div>
            </Link>
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
          holidayListPath={modules?.holiday ? '/parent/holidays' : ''}
          saturdayConfig={saturdayConfig}
        />
      </div>
    </div>
  );
}
