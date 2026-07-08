import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getPayments, recordPayment, approvePayment, rejectPayment, downloadAdminReceipt } from '../../../api/fees.api';
import { getStudents } from '../../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../../components/ui/index';

const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const STATUS_COLOR = { pending: 'warning', completed: 'success', failed: 'danger', refunded: 'muted' };
const MODE_COLOR   = { cash: 'info', online: 'success', cheque: 'warning', upi: 'success', bank_transfer: 'info', dd: 'warning' };

const EMPTY_FORM = { studentId: '', amount: '', paymentMode: 'cash', transactionRef: '', remarks: '', paymentDate: '' };

export default function AdminPayments() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: payments, loading, refetch } = useFetch(
    () => getPayments({ paymentStatus: statusFilter || undefined }), [statusFilter]);

  const [modal,  setModal]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [reject, setReject] = useState(null);

  // student search picker
  const [studentQ, setStudentQ]           = useState('');
  const [students, setStudents]           = useState([]);
  const [studentPicked, setStudentPicked] = useState(null);

  useEffect(() => {
    if (!modal || studentPicked) return;
    const t = setTimeout(async () => {
      try {
        const res = await getStudents({ search: studentQ || undefined, limit: 10 });
        setStudents(res?.data || []);
      } catch { /* silent */ }
    }, 300);
    return () => clearTimeout(t);
  }, [modal, studentQ, studentPicked]);

  const handleRecord = async (e) => {
    e.preventDefault();
    if (!form.studentId) return toast.error('Select a student');
    setSaving(true);
    try {
      const res = await recordPayment(form);
      toast.success(`Payment recorded — Receipt ${res.data?.receiptNumber || ''}`);
      setModal(false);
      setForm(EMPTY_FORM); setStudentPicked(null); setStudentQ('');
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleApprove = async (id) => {
    try {
      const res = await approvePayment(id);
      toast.success(`Payment approved — Receipt ${res.data?.receiptNumber || ''}`);
      refetch();
    } catch (err) { toast.error(err.message); }
  };

  const handleReject = async () => {
    try {
      await rejectPayment(reject._id);
      toast.success('Payment rejected');
      setReject(null);
      refetch();
    } catch (err) { toast.error(err.message); }
  };

  const downloadReceipt = async (p) => {
    try {
      const blob = await downloadAdminReceipt(p._id);
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${p.receiptNumber || p._id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message || 'Download failed'); }
  };

  const columns = [
    { key: 'student', label: 'Student', render: r => (
      <div>
        <strong>{r.student?.name || r.studentSnapshot?.name || '—'}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.receiptNumber || 'no receipt yet'}</div>
      </div>
    )},
    { key: 'amount', label: 'Amount', render: r => <strong>{fmt(r.amount)}</strong> },
    { key: 'mode',   label: 'Mode',   render: r => <Badge variant={MODE_COLOR[r.paymentMode] || 'muted'}>{(r.paymentMode || '—').replace('_', ' ')}</Badge> },
    { key: 'gateway',label: 'Source', render: r => r.gateway === 'manual' ? (r.collectedBy?.name ? `by ${r.collectedBy.name}` : 'manual') : r.gateway },
    { key: 'date',   label: 'Date',   render: r => r.paymentDate ? new Date(r.paymentDate).toLocaleDateString('en-IN') : '—' },
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS_COLOR[r.paymentStatus] || 'muted'}>{r.paymentStatus}</Badge> },
    { key: 'actions', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        {r.paymentStatus === 'pending' && (
          <>
            <Button size="sm" onClick={() => handleApprove(r._id)}>Approve</Button>
            <Button size="sm" variant="danger" onClick={() => setReject(r)}>Reject</Button>
          </>
        )}
        {r.paymentStatus === 'completed' && (
          <Button size="sm" variant="secondary" onClick={() => downloadReceipt(r)}>⬇ Receipt</Button>
        )}
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Payments" subtitle="Fee payment records — approve pending submissions"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="form-control" style={{ width: 150 }} value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <Button onClick={() => setModal(true)}>+ Record Payment</Button>
          </div>
        } />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={payments} emptyIcon="💳" emptyTitle="No payments" />}
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Record Payment (counter collection)"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="pay-form" type="submit" loading={saving}>Record</Button>
        </>}>
        <form id="pay-form" onSubmit={handleRecord}>
          <div className="form-group">
            <label className="form-label required">Student</label>
            {studentPicked ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                <span><strong>{studentPicked.name}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{studentPicked.email}</span></span>
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => { setStudentPicked(null); setForm(f => ({ ...f, studentId: '' })); }}>Change</button>
              </div>
            ) : (
              <>
                <input className="form-control" placeholder="Search student by name or email…"
                  value={studentQ} onChange={e => setStudentQ(e.target.value)} />
                {students.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
                    {students.map(s => (
                      <div key={s._id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                        onClick={() => { setStudentPicked(s); setForm(f => ({ ...f, studentId: s._id })); }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <strong style={{ fontSize: '.88rem' }}>{s.name}</strong>
                        <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                          {s.rollNumber ? `Roll ${s.rollNumber} · ` : ''}{s.email}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Amount (₹)</label>
              <input type="number" min="1" step="0.01" className="form-control" required value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Payment Mode</label>
              <select className="form-control" value={form.paymentMode}
                onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value }))}>
                {['cash','upi','bank_transfer','cheque','dd','online'].map(m =>
                  <option key={m} value={m}>{m.replace('_', ' ').toUpperCase()}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Reference No.</label>
              <input className="form-control" value={form.transactionRef}
                onChange={e => setForm(f => ({ ...f, transactionRef: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Date</label>
              <input type="date" className="form-control" value={form.paymentDate}
                onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Remarks</label>
            <input className="form-control" value={form.remarks}
              onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Confirm open={!!reject} onClose={() => setReject(null)} onConfirm={handleReject}
        title="Reject Payment"
        message={`Reject this ${fmt(reject?.amount)} payment from ${reject?.student?.name || 'student'}? It will be marked failed.`} />
    </div>
  );
}
