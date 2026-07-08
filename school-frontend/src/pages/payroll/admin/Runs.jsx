import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner } from '../../../components/ui/index';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const STATUS_COLOR = { draft: 'warning', reviewed: 'info', approved: 'primary', published: 'success' };

// draft → reviewed → approved → published
const NEXT_ACTION = {
  draft:    { label: 'Mark Reviewed', status: 'reviewed' },
  reviewed: { label: 'Approve',       status: 'approved' },
};

export default function PayrollRuns() {
  const { data: runs, loading, refetch } = useFetch(api.getPayrollRuns);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ month: '', year: new Date().getFullYear() });

  const [detail, setDetail]         = useState(null);
  const [detailLoad, setDetailLoad] = useState(false);
  const [busy, setBusy]             = useState(false);

  const loadDetail = async (id) => {
    setDetailLoad(true);
    try {
      const res = await api.getRunDetail(id);
      setDetail(res.data);
    } catch (err) { toast.error(err.message); }
    finally { setDetailLoad(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createRun(form);
      toast.success('Payroll run created');
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleStatus = async (run, status) => {
    setBusy(true);
    try {
      await api.updateRunStatus(run._id, status);
      toast.success(`Run marked ${status}`);
      refetch();
      if (detail?._id === run._id) loadDetail(run._id);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const handlePublish = async (run) => {
    setBusy(true);
    try {
      await api.publishRun(run._id);
      toast.success('Run published — payslips generated');
      refetch();
      if (detail?._id === run._id) loadDetail(run._id);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const downloadSlip = async (entry) => {
    try {
      const blob = await api.adminDownloadPayslip(entry.payslip._id);
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip_${(entry.employee?.name || 'employee').replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message || 'Download failed'); }
  };

  const columns = [
    { key: 'month',  label: 'Period',    render: r => <strong>{MONTHS[(r.month || 1) - 1]} {r.year}</strong> },
    { key: 'emp',    label: 'Employees', render: r => r.totalEmployees ?? 0 },
    { key: 'gross',  label: 'Gross',     render: r => fmt(r.totalGross) },
    { key: 'net',    label: 'Net',       render: r => <strong>{fmt(r.totalNet)}</strong> },
    { key: 'status', label: 'Status',    render: r => <Badge variant={STATUS_COLOR[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={() => loadDetail(r._id)}>View</Button>
        {NEXT_ACTION[r.status] && (
          <Button size="sm" loading={busy} onClick={() => handleStatus(r, NEXT_ACTION[r.status].status)}>
            {NEXT_ACTION[r.status].label}
          </Button>
        )}
        {r.status === 'approved' && (
          <Button size="sm" loading={busy} onClick={() => handlePublish(r)}>Publish</Button>
        )}
      </div>
    )},
  ];

  const entryCols = [
    { key: 'emp',   label: 'Employee', render: e => (
      <div>
        <strong>{e.employee?.name || '—'}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{e.employee?.email || ''}</div>
      </div>
    )},
    { key: 'gross', label: 'Gross',      render: e => fmt(e.grossSalary) },
    { key: 'lop',   label: 'LOP',        render: e => e.lopAmount ? <span style={{ color: 'var(--danger, #ef4444)' }}>−{fmt(e.lopAmount)}</span> : '—' },
    { key: 'ded',   label: 'Deductions', render: e => fmt(e.totalDeductions) },
    { key: 'net',   label: 'Net',        render: e => <strong>{fmt(e.netSalary)}</strong> },
    { key: 'slip',  label: 'Payslip',    render: e => e.payslip
      ? <Button size="sm" variant="secondary" onClick={() => downloadSlip(e)}>⬇ PDF</Button>
      : <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>after publish</span> },
  ];

  return (
    <div className="page">
      <PageHeader title="Payroll Runs" subtitle="Monthly payroll processing — draft → reviewed → approved → published"
        action={<Button onClick={() => setModal(true)}>+ New Run</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={runs} emptyIcon="💼" emptyTitle="No payroll runs" />}
        </div>
      </div>

      {/* Create run */}
      <Modal open={modal} onClose={() => setModal(false)} title="Create Payroll Run"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="run-form" type="submit" loading={saving}>Create</Button>
        </>}>
        <form id="run-form" onSubmit={handleCreate}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Month</label>
              <select className="form-control" required value={form.month}
                onChange={e => setForm(f => ({ ...f, month: e.target.value }))}>
                <option value="">— Select —</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Year</label>
              <select className="form-control" value={form.year}
                onChange={e => setForm(f => ({ ...f, year: +e.target.value }))}>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y =>
                  <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <p style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>
            Entries are computed for every active salary assignment when the run is created.
          </p>
        </form>
      </Modal>

      {/* Run detail */}
      <Modal open={!!detail || detailLoad} onClose={() => setDetail(null)} maxWidth={860}
        title={detail ? `Run — ${MONTHS[(detail.month || 1) - 1]} ${detail.year}` : 'Loading…'}>
        {detailLoad || !detail ? (
          <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge variant={STATUS_COLOR[detail.status] || 'muted'}>{detail.status}</Badge>
              <span style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
                {detail.totalEmployees ?? 0} employees · Gross {fmt(detail.totalGross)} · Net {fmt(detail.totalNet)}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {NEXT_ACTION[detail.status] && (
                  <Button size="sm" loading={busy} onClick={() => handleStatus(detail, NEXT_ACTION[detail.status].status)}>
                    {NEXT_ACTION[detail.status].label}
                  </Button>
                )}
                {detail.status === 'approved' && (
                  <Button size="sm" loading={busy} onClick={() => handlePublish(detail)}>Publish</Button>
                )}
              </div>
            </div>
            <div style={{ maxHeight: 420, overflowY: 'auto' }}>
              <Table columns={entryCols} data={detail.entries} emptyIcon="👥" emptyTitle="No entries" />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
