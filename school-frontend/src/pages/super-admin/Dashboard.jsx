import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getDashboard, getSchools } from '../../api/superAdmin.api';
import { StatCard, Spinner } from '../../components/ui/index';

export default function SADashboard() {
  const navigate = useNavigate();
  const { data, loading } = useFetch(getDashboard);

  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop]   = useState(false);
  const debounceRef = useRef(null);
  const wrapRef     = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setShowDrop(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await getSchools({ search: query.trim(), limit: 8 });
        const list = res?.data?.data || res?.data || [];
        setResults(list);
        setShowDrop(true);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const quickLinks = [
    { to: '/super-admin/schools',     icon: '🏫', label: 'Manage Schools',     desc: 'Create, edit & delete schools' },
    { to: '/super-admin/users',       icon: '👥', label: 'Manage Users',       desc: 'All users across schools' },
    { to: '/super-admin/permissions', icon: '🔑', label: 'Module Permissions', desc: 'Control module access per school' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Super Admin Dashboard</h1>
          <p className="text-muted">System-wide overview</p>
        </div>
      </div>

      {/* ── Search ── */}
      <div ref={wrapRef} style={{ position: 'relative', maxWidth: 480, marginBottom: 28 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', pointerEvents: 'none' }}>🔍</span>
          <input
            className="form-control"
            style={{ paddingLeft: 36, paddingRight: searching ? 36 : 12 }}
            placeholder="Search schools by name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => results.length && setShowDrop(true)}
          />
          {searching && (
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '.75rem', color: 'var(--text-muted)' }}>⏳</span>
          )}
        </div>
        {showDrop && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden', marginTop: 4,
          }}>
            {results.length === 0
              ? <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '.9rem' }}>No schools found</div>
              : results.map(s => (
                <button key={s._id}
                  onClick={() => { navigate(`/super-admin/schools/${s._id}/edit`); setShowDrop(false); setQuery(''); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderBottom: '1px solid var(--border)', transition: 'background .15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {s.logo ? <img src={s.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🏫</span>}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    {s.code && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Code: {s.code}</div>}
                  </div>
                  <span style={{ fontSize: '.75rem', color: 'var(--primary)', flexShrink: 0 }}>Edit →</span>
                </button>
              ))
            }
          </div>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <StatCard icon="🏫" label="Total Schools" value={data?.schoolCount} color="blue" />
        <StatCard icon="👥" label="Total Users"   value={data?.userCount}   color="green" />
        <StatCard icon="👤" label="School Admins" value={data?.roles?.admins ?? '—'}   color="purple" />
        <StatCard icon="👨‍🏫" label="Teachers"     value={data?.roles?.teachers ?? '—'} color="orange" />
        <StatCard icon="👨‍🎓" label="Students"     value={data?.roles?.students ?? '—'} color="blue" />
        <StatCard icon="👨‍👩‍👧" label="Parents"      value={data?.roles?.parents ?? '—'}  color="green" />
      </div>

      {/* ── Quick Links ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16, marginBottom: 28 }}>
        {quickLinks.map(item => (
          <Link key={item.to} to={item.to}
            style={{
              display: 'block', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: 20, transition: 'box-shadow .2s',
              textDecoration: 'none', color: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>{item.desc}</div>
          </Link>
        ))}
      </div>

      {/* ── Recently added schools ── */}
      {(data?.recentSchools || []).length > 0 && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="card-title">Recently added schools</h3>
            <Link to="/super-admin/schools" style={{ fontSize: '.82rem' }}>View all →</Link>
          </div>
          <div className="card-body" style={{ padding: '4px 16px' }}>
            {data.recentSchools.map(s => (
              <Link key={s._id} to={`/super-admin/schools/${s._id}/edit`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {s.logo ? <img src={s.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🏫</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{s.name}</div>
                  {s.code && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Code: {s.code}</div>}
                </div>
                <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                  {s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : ''}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
