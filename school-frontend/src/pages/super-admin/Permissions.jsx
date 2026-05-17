import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/superAdmin.api';
import { PageHeader, Spinner } from '../../components/ui/index';

const MODULES = [
  { key: 'attendance',    label: 'Attendance',     icon: '✅' },
  { key: 'timetable',    label: 'Timetable',      icon: '🕐' },
  { key: 'result',       label: 'Results',        icon: '📊' },
  { key: 'aptitudeExam', label: 'Aptitude Exams', icon: '📝' },
  { key: 'fees',         label: 'Fees',           icon: '💰' },
  { key: 'payroll',      label: 'Payroll',        icon: '💵' },
  { key: 'library',      label: 'Library',        icon: '📖' },
  { key: 'leave',        label: 'Leave',          icon: '🏖️' },
  { key: 'document',     label: 'Documents',      icon: '📁' },
  { key: 'holiday',      label: 'Holidays',       icon: '🎉' },
  { key: 'notification', label: 'Notifications',  icon: '🔔' },
  { key: 'chat',         label: 'Chat',           icon: '💬' },
];

function Toggle({ enabled, loading, onClick }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      disabled={loading}
      title={enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none',
        background: enabled ? 'var(--success, #22c55e)' : 'var(--border)',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'background .2s', position: 'relative', flexShrink: 0,
        opacity: loading ? 0.6 : 1,
      }}>
      <span style={{
        position: 'absolute', top: 2, left: enabled ? 22 : 2,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.25)',
      }} />
    </button>
  );
}

export default function Permissions() {
  const { data: serverData, loading } = useFetch(api.getPermissions);

  // Local copy of schools so we can update without refetch
  const [schools,  setSchools]  = useState([]);
  const [saving,   setSaving]   = useState({});
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState({});

  // Sync server data into local state once
  useEffect(() => {
    if (serverData) setSchools(serverData);
  }, [serverData]);

  /* Toggle a single module — optimistic local update, no page reload */
  const toggle = async (schoolId, module, current) => {
    const key    = `${schoolId}_${module}`;
    const newVal = !current;

    // Optimistic update
    setSchools(prev => prev.map(s => s._id !== schoolId ? s : {
      ...s, modules: { ...(s.modules || {}), [module]: newVal },
    }));
    setSaving(s => ({ ...s, [key]: true }));

    try {
      const school  = schools.find(s => s._id === schoolId);
      const modules = { ...(school.modules || {}), [module]: newVal };
      await api.updatePermissions({ schoolId, modules });
      toast.success(`${module} ${newVal ? 'enabled' : 'disabled'}`);
    } catch (err) {
      // Rollback on failure
      setSchools(prev => prev.map(s => s._id !== schoolId ? s : {
        ...s, modules: { ...(s.modules || {}), [module]: current },
      }));
      toast.error(err.message);
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  /* Toggle all modules for a school — optimistic */
  const toggleAll = async (schoolId, enableAll) => {
    const key     = `${schoolId}_all`;
    const modules = Object.fromEntries(MODULES.map(m => [m.key, enableAll]));

    // Optimistic update
    setSchools(prev => prev.map(s => s._id !== schoolId ? s : { ...s, modules }));
    setSaving(s => ({ ...s, [key]: true }));

    try {
      await api.updatePermissions({ schoolId, modules });
      toast.success(enableAll ? 'All modules enabled' : 'All modules disabled');
    } catch (err) {
      // Rollback — restore server data for this school
      const original = serverData?.find(s => s._id === schoolId);
      if (original) setSchools(prev => prev.map(s => s._id !== schoolId ? s : original));
      toast.error(err.message);
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  /* Expand/collapse — fix: account for default-open (undefined → treat as true) */
  const toggleExpand = (id) => {
    setExpanded(e => ({ ...e, [id]: !(e[id] ?? true) }));
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const filtered = schools.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <PageHeader
        title="Module Permissions"
        subtitle="Control which modules each school can access"
      />

      <div style={{ marginBottom: 20, maxWidth: 320 }}>
        <input className="form-control" placeholder="🔍 Filter schools…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          No schools found
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(school => {
          const mods      = school.modules || {};
          const enabled   = MODULES.filter(m => mods[m.key]).length;
          const isOpen    = expanded[school._id] ?? true;
          const allSaving = saving[`${school._id}_all`];

          return (
            <div key={school._id} className="card">
              {/* School header row */}
              <div
                className="card-header"
                style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleExpand(school._id)}
              >
                <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {school.logo
                    ? <img src={school.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span>🏫</span>}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{school.name}</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                    {enabled} / {MODULES.length} modules enabled
                  </div>
                </div>

                {/* Action buttons — stop propagation so they don't toggle expand */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-secondary btn-sm" disabled={allSaving}
                    onClick={() => toggleAll(school._id, true)}>Enable All</button>
                  <button className="btn btn-secondary btn-sm" disabled={allSaving}
                    onClick={() => toggleAll(school._id, false)}>Disable All</button>
                </div>

                {/* Chevron arrow */}
                <span style={{
                  color: 'var(--text-muted)', fontSize: '.85rem', marginLeft: 4,
                  transition: 'transform .2s',
                  display: 'inline-block',
                  transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}>▼</span>
              </div>

              {/* Module grid */}
              {isOpen && (
                <div className="card-body" style={{ paddingTop: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                    {MODULES.map(m => {
                      const en  = mods[m.key] || false;
                      const key = `${school._id}_${m.key}`;
                      return (
                        <div key={m.key} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', borderRadius: 'var(--radius)',
                          border: `1px solid ${en ? 'rgba(34,197,94,.3)' : 'var(--border)'}`,
                          background: en ? 'rgba(34,197,94,.06)' : 'var(--bg)',
                          transition: 'all .2s',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1.1rem' }}>{m.icon}</span>
                            <span style={{ fontSize: '.85rem', fontWeight: en ? 600 : 400 }}>{m.label}</span>
                          </div>
                          <Toggle
                            enabled={en}
                            loading={!!saving[key]}
                            onClick={() => toggle(school._id, m.key, en)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
