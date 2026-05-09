import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getPayments, recordPayment, approvePayment } from '../../../api/fees.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner } from '../../../components/ui/index';

export default function AdminPayments() {
  const { data: payments, loading, refetch } = useFetch(getPayments);
  const [modal,    setModal]   = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [form, setForm] = useState({ student: '', feeHead: '', amount: '', mode: 'cash', reference: '' });

  const handleRecord = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await recordPayment(form);
      toast.success('Payment recorded');
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleApprove = async (id) => {
    try {
      await approvePayment(id);
      toast.success('Payment approved');
      refetch();
    } catch (err) { toast.error(err.message); }
  };

  const statusColor = { pending: 'warning', approved: 'success', rejected: 'danger' };
  const modeColor   = { cash: 'info', online: 'success', cheque: 'warning', upi: 'success' };

  const columns = [
    { key: 'student',   label: 'Student',   render: r => <strong>{r.student?.name || '—'}</strong> },
    { key: 'amount',    label: 'Amount',    render: r => `₹${(r.amount||0).toLocaleString()}` },
    { key: 'mode',      label: 'Mode',      render: r => <Badge variant={modeColor[r.mode] || 'muted'}>{r.mode}</Badge> },
    { key: 'date',      label: 'Date',      render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'status',    label: 'Status',    render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'actions',   label: '',          render: r => r.status === 'pending' && (
      <Button size="sm" onClick={() => handleApprove(r._id)}>Approve</Button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Payments" subtitle="Fee payment records"
        action={<Button onClick={() => setModal(true)}>+ Record Payment</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={payments} emptyIcon="💳" emptyTitle="No payments" />}
        </div>
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title="Record Payment"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="pay-form" type="submit" loading={saving}>Record</Button>
        </>}>
        <form id="pay-form" onSubmit={handleRecord}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Student ID</label>
              <input className="form-control" required value={form.student}
                onChange={e => setForm(f => ({ ...f, student: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Amount (₹)</label>
              <input type="number" className="form-control" required value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Payment Mode</label>
              <select className="form-control" value={form.mode}
                onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
                {['cash','online','cheque','upi','dd'].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reference No.</label>
              <input className="form-control" value={form.reference}
                onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
