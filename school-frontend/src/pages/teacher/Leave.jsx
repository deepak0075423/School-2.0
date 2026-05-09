import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getMyLeaves, applyLeave, cancelLeave } from '../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../components/ui/index';

export default function TeacherLeave() {
  const { data: leaves, loading, refetch } = useFetch(getMyLeaves);
  const [modal, setModal]   = useState(false);
  const [cancel, setCancel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cancLoad, setCL]   = useState(false);
  const [form, setForm]     = useState({ leaveType: '', startDate: '', endDate: '', reason: '' });

  const handleApply = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      await applyLeave(fd);
      toast.success('Leave applied!');
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleCancel = async () => {
    setCL(true);
    try { await cancelLeave(cancel._id); toast.success('Leave cancelled'); setCancel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setCL(false); }
  };

  const statusColor = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'muted' };

  const columns = [
    { key: 'type',    label: 'Type',   render: r => r.leaveType?.name || r.type || '—' },
    { key: 'from',    label: 'From',   render: r => r.startDate ? new Date(r.startDate).toLocaleDateString() : '—' },
    { key: 'to',      label: 'To',     render: r => r.endDate ? new Date(r.endDate).toLocaleDateString() : '—' },
    { key: 'days',    label: 'Days',   render: r => r.days || '—' },
    { key: 'status',  label: 'Status', render: r =>
      <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'actions', label: '',       render: r => r.status === 'pending' && (
      <button className="btn btn-danger btn-sm" onClick={() => setCancel(r)}>Cancel</button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="My Leave" subtitle="Leave applications and balances"
        action={<Button onClick={() => setModal(true)}>+ Apply Leave</Button>} />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={leaves} emptyIcon="🏖️" emptyTitle="No leave applications" />}
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Apply for Leave"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="leave-form" type="submit" loading={saving}>Submit</Button>
        </>}>
        <form id="leave-form" onSubmit={handleApply}>
          <div className="form-group">
            <label className="form-label required">Reason</label>
            <textarea className="form-control" rows={3} required value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">From</label>
              <input type="date" className="form-control" required value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">To</label>
              <input type="date" className="form-control" required value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>

      <Confirm open={!!cancel} onClose={() => setCancel(null)} onConfirm={handleCancel}
        loading={cancLoad} title="Cancel Leave" message="Cancel this leave application?" />
    </div>
  );
}
