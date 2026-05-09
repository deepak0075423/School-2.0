import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getMyCtc, getMyPayslips } from '../../api/payroll.api';
import { PageHeader, Table, Button, Spinner, Card } from '../../components/ui/index';

export default function TeacherPayroll() {
  const { data: ctc,     loading: cl } = useFetch(getMyCtc);
  const { data: payslips,loading: pl } = useFetch(getMyPayslips);

  const columns = [
    { key: 'month',   label: 'Month',   render: r => `${r.month} ${r.year}` },
    { key: 'net',     label: 'Net Pay', render: r => `₹${(r.netPay || 0).toLocaleString()}` },
    { key: 'status',  label: 'Status' },
    { key: 'actions', label: '',        render: r => <Button size="sm" variant="secondary">Download</Button> },
  ];

  return (
    <div className="page">
      <PageHeader title="My Payroll" subtitle="CTC and payslips" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        <Card title="My CTC">
          {cl ? <Spinner size="sm" /> : ctc ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['Basic',       ctc.basic],
                ['HRA',         ctc.hra],
                ['Allowances',  ctc.allowances],
                ['Deductions',  ctc.deductions],
                ['Gross',       ctc.gross],
                ['Net Pay',     ctc.net],
              ].map(([k,v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted text-sm">{k}</span>
                  <strong>₹{(v||0).toLocaleString()}</strong>
                </div>
              ))}
            </div>
          ) : <p className="text-muted">No salary assigned yet.</p>}
        </Card>

        <Card title="Payslips">
          {pl ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
            : <Table columns={columns} data={payslips} emptyIcon="💵" emptyTitle="No payslips" />}
        </Card>
      </div>
    </div>
  );
}
