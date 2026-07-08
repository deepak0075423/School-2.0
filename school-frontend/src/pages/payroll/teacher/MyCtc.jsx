import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getMyCtc } from '../../../api/payroll.api';
import { PageHeader, Spinner, Card, StatCard, Badge } from '../../../components/ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function TeacherMyCtc() {
  const { data, loading } = useFetch(getMyCtc);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const asgn      = data?.assignment;
  const breakdown = data?.breakdown;

  return (
    <div className="page">
      <PageHeader title="My CTC" subtitle="Salary and compensation breakdown" />
      {!asgn ? (
        <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>💰</div>
          <h3>No salary assigned yet</h3>
          <p style={{ color: 'var(--text-muted)' }}>Your salary structure has not been set up. Contact the school admin.</p>
        </div></div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatCard icon="💼" label="Annual CTC"     value={fmt(asgn.ctc)} />
            <StatCard icon="📅" label="Monthly CTC"    value={fmt(data.monthlyCtc)} />
            <StatCard icon="💵" label="Net (monthly)"  value={fmt(breakdown?.netSalary)} color="green" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <Card title={`Structure — ${asgn.structure?.name || ''}`}>
              <div style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: '.85rem' }}>Earnings</strong>
                {(breakdown?.earnings || []).map(e => (
                  <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.9rem' }}>
                    <span>{e.name}</span><span>{fmt(e.amount)}</span>
                  </div>
                ))}
              </div>
              <div>
                <strong style={{ fontSize: '.85rem' }}>Deductions</strong>
                {(breakdown?.deductions || []).length === 0 && (
                  <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', padding: '6px 0' }}>None</div>
                )}
                {(breakdown?.deductions || []).map(d => (
                  <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.9rem' }}>
                    <span>{d.name}</span><span>−{fmt(d.amount)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '2px solid var(--primary)' }}>
                <strong>Net Pay (monthly)</strong>
                <strong style={{ color: 'var(--primary)' }}>{fmt(breakdown?.netSalary)}</strong>
              </div>
            </Card>

            <Card title="Assignment details">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted">Effective from</span>
                  <span>{asgn.effectiveFrom ? new Date(asgn.effectiveFrom).toLocaleDateString('en-IN') : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted">Status</span>
                  <Badge variant={asgn.isActive ? 'success' : 'muted'}>{asgn.isActive ? 'active' : 'inactive'}</Badge>
                </div>
                {(asgn.componentOverrides || []).length > 0 && (
                  <div>
                    <span className="text-muted">Overrides</span>
                    {asgn.componentOverrides.map(o => (
                      <div key={o.componentName} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span>{o.componentName}</span><span>{fmt(o.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
