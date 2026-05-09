import React from 'react';
import useFetch from '../../../hooks/useFetch';
import { getMyCtc } from '../../../api/payroll.api';
import { PageHeader, Spinner, Card } from '../../../components/ui/index';

export default function TeacherMyCtc() {
  const { data: ctc, loading } = useFetch(getMyCtc);

  return (
    <div className="page">
      <PageHeader title="My CTC" subtitle="Salary and compensation breakdown" />
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : ctc ? (
        <div style={{ maxWidth: 480 }}>
          <Card title="Salary Breakdown">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['Basic',       ctc.basic],
                ['HRA',         ctc.hra],
                ['Allowances',  ctc.allowances],
                ['Gross Pay',   (ctc.basic||0)+(ctc.hra||0)+(ctc.allowances||0)],
                ['Deductions',  ctc.deductions],
                ['Net Pay',     ctc.net || ctc.netPay],
              ].map(([k,v], i, arr) => (
                <div key={k} style={{
                  display: 'flex', justifyContent: 'space-between',
                  paddingBottom: 10, marginBottom: 2,
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  ...(k === 'Net Pay' ? { marginTop: 8, paddingTop: 8, borderTop: '2px solid var(--primary)' } : {}),
                }}>
                  <span className="text-muted text-sm">{k}</span>
                  <strong style={k === 'Net Pay' ? { color: 'var(--primary)', fontSize: '1.1rem' } : {}}>
                    ₹{(v||0).toLocaleString()}
                  </strong>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <div className="empty-state"><div className="empty-icon">💰</div><h3>No salary assigned yet</h3></div>
      )}
    </div>
  );
}
