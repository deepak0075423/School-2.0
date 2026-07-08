import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getMyPayslips, getPayslipDetail, downloadMyPayslip } from '../../../api/payroll.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner } from '../../../components/ui/index';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function TeacherPayslips() {
  const { data, loading } = useFetch(getMyPayslips);
  const payslips = data || [];

  const [detail, setDetail]         = useState(null);
  const [detailLoad, setDetailLoad] = useState(false);

  const statusColor = { draft: 'warning', approved: 'info', published: 'success', paid: 'success' };

  const openDetail = async (p) => {
    setDetailLoad(true);
    try {
      const res = await getPayslipDetail(p._id);
      setDetail(res.data);
    } catch (err) { toast.error(err.message); }
    finally { setDetailLoad(false); }
  };

  const handleDownload = async (payslip) => {
    try {
      const blob = await downloadMyPayslip(payslip._id);
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip_${MONTHS[(payslip.month||1)-1]}_${payslip.year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.message || 'Download failed');
    }
  };

  const columns = [
    { key: 'period',  label: 'Period',  render: r => <strong>{MONTHS[(r.month||1)-1]} {r.year}</strong> },
    { key: 'gross',   label: 'Gross',   render: r => fmt(r.grossSalary) },
    { key: 'ded',     label: 'Deductions', render: r => fmt(r.totalDeductions) },
    { key: 'net',     label: 'Net Pay', render: r => <strong>{fmt(r.netSalary)}</strong> },
    { key: 'status',  label: 'Status',  render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'actions', label: '',        render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => openDetail(r)}>View</Button>
        <Button size="sm" variant="secondary" onClick={() => handleDownload(r)}>⬇ PDF</Button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="My Salary Slips" subtitle="Monthly payslips" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={payslips} emptyIcon="📄" emptyTitle="No payslips yet" />}
        </div>
      </div>

      <Modal open={!!detail || detailLoad} onClose={() => setDetail(null)}
        title={detail ? `Salary Slip — ${MONTHS[(detail.month||1)-1]} ${detail.year}` : 'Loading…'}>
        {detailLoad || !detail ? (
          <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : (
          <>
            <div style={{ marginBottom: 14, fontSize: '.88rem', color: 'var(--text-muted)' }}>
              {detail.employeeSnapshot?.name} · {detail.employeeSnapshot?.designation || '—'}
              {detail.employeeSnapshot?.employeeId ? ` · ID ${detail.employeeSnapshot.employeeId}` : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <strong style={{ fontSize: '.85rem' }}>Earnings</strong>
                {(detail.earnings || []).map(e => (
                  <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.88rem' }}>
                    <span>{e.name}</span><span>{fmt(e.amount)}</span>
                  </div>
                ))}
              </div>
              <div>
                <strong style={{ fontSize: '.85rem' }}>Deductions</strong>
                {(detail.deductions || []).length === 0 && <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', padding: '6px 0' }}>None</div>}
                {(detail.deductions || []).map(d => (
                  <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.88rem' }}>
                    <span>{d.name}</span><span>{fmt(d.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 16, borderTop: '2px solid var(--border)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
                <span>Gross Salary</span><strong>{fmt(detail.grossSalary)}</strong>
              </div>
              {detail.lopDays > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem', color: 'var(--danger, #ef4444)' }}>
                  <span>Loss of pay ({detail.lopDays} day{detail.lopDays !== 1 ? 's' : ''})</span>
                  <span>−{fmt(detail.lopAmount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9rem' }}>
                <span>Total Deductions</span><strong>−{fmt(detail.totalDeductions)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', marginTop: 8, color: 'var(--primary)' }}>
                <strong>Net Salary</strong><strong>{fmt(detail.netSalary)}</strong>
              </div>
            </div>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Button variant="secondary" onClick={() => handleDownload(detail)}>⬇ Download PDF</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
