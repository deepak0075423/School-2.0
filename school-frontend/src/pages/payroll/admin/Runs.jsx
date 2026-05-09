import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getPayrollRuns, createRun, publishRun } from '../../../api/payroll.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner } from '../../../components/ui/index';

export default function PayrollRuns() {
  const { data: runs, loading, refetch } = useFetch(getPayrollRuns);
  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form,   setForm]   = useState({ month: '', year: new Date().getFullYear() });

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createRun(form);
      toast.success('Payroll run created');
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handlePublish = async (id) => {
    try {
      await publishRun(id);
      toast.success('Payslips published');
      refetch();
    } catch (err) { toast.error(err.message); }
  };

  const statusColor = { draft: 'warning', published: 'success', processing: 'info' };

  const columns = [
    { key: 'month',   label: 'Period',   render: r => `${r.month} ${r.year}` },
    { key: 'total',   label: 'Total',    render: r => `₹${(r.totalPayout||0).toLocaleString()}` },
    { key: 'count',   label: 'Employees',render: r => r.payslipCount || 0 },
    { key: 'status',  label: 'Status',   render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'actions', label: '',         render: r => r.status === 'draft' && (
      <Button size="sm" onClick={() => handlePublish(r._id)}>Publish</Button>
    )},
  ];

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return (
    <div className="page">
      <PageHeader title="Payroll Runs" subtitle="Monthly payroll processing"
        action={<Button onClick={() => setModal(true)}>+ New Run</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={runs} emptyIcon="💼" emptyTitle="No payroll runs" />}
        </div>
      </div>
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
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Year</label>
              <select className="form-control" value={form.year}
                onChange={e => setForm(f => ({ ...f, year: +e.target.value }))}>
                {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
