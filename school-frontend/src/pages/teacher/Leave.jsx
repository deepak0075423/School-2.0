import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getMyLeaves, getLeaveBalance, applyLeave, cancelLeave } from '../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_VARIANT = {
  pending: 'warning', approved: 'success', rejected: 'danger',
  cancelled: 'muted', modification_requested: 'info',
};

const EMPTY_FORM = { leaveTypeId: '', fromDate: '', toDate: '', leaveMode: 'full_day', reason: '' };

export default function TeacherLeave() {
  const [tab, setTab] = useState('my-leaves');

  // ── My Leaves ─────────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState('');
  const { data: leavesData, loading: leavesLoading, refetch } = useFetch(
    () => getMyLeaves({ status: filterStatus || undefined }),
    [filterStatus],
  );
  const leaves = leavesData?.data || leavesData || [];

  // ── Balance ───────────────────────────────────────────────────────────────────
  const { data: balData, loading: balLoading, refetch: refetchBal } = useFetch(getLeaveBalance);
  const balances = balData?.data || [];

  // Extract leave types from balance data (each row has a populated leaveType)
  const leaveTypes = balances.map(b => b.leaveType).filter(Boolean);

  // ── Apply Leave ───────────────────────────────────────────────────────────────
  const [modal,   setModal]   = useState(false);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);

  const handleApply = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('leaveTypeId', form.leaveTypeId);
      fd.append('fromDate',    form.fromDate);
      fd.append('toDate',      form.toDate);
      fd.append('leaveMode',   form.leaveMode);
      fd.append('reason',      form.reason);
      await applyLeave(fd);
      toast.success('Leave application submitted');
      setModal(false); setForm(EMPTY_FORM);
      refetch(); refetchBal();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  // ── Cancel Leave ──────────────────────────────────────────────────────────────
  const [cancelItem, setCancelItem] = useState(null);
  const [cancLoad,   setCancLoad]   = useState(false);

  const handleCancel = async () => {
    setCancLoad(true);
    try {
      await cancelLeave(cancelItem._id);
      toast.success('Leave cancelled');
      setCancelItem(null); refetch(); refetchBal();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setCancLoad(false); }
  };

  const leaveColumns = [
    { key: 'type',    label: 'Type',    render: r => r.leaveType?.name || '—' },
    { key: 'dates',   label: 'Period',  render: r => <div><div>{fmtDate(r.fromDate)} – {fmtDate(r.toDate)}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.totalDays} day(s) · {r.leaveMode?.replace('_', ' ')}</div></div> },
    { key: 'status',  label: 'Status',  render: r => <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status?.replace('_', ' ')}</Badge> },
    { key: 'reason',  label: 'Reason',  render: r => <span style={{ fontSize: '.82rem' }}>{r.reason || '—'}</span> },
    { key: 'comment', label: 'Admin Comment', render: r => r.adminComment ? <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{r.adminComment}</span> : '—' },
    { key: 'actions', label: '', render: r => (r.status === 'pending' || r.status === 'modification_requested') ? (
      <button className="btn btn-danger btn-sm" onClick={() => setCancelItem(r)}>Cancel</button>
    ) : null },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <PageHeader title="My Leave" subtitle="Leave applications and balance"
        action={<Button onClick={() => { setForm(EMPTY_FORM); setModal(true); }}>+ Apply Leave</Button>}
      />

      <div className="tabs">
        {[['my-leaves','My Applications'],['balance','Leave Balance']].map(([key, label]) => (
          <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* ── My Applications ── */}
      {tab === 'my-leaves' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', gap: 8 }}>
            <select className="form-control" style={{ width: 160 }} value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {['pending','approved','rejected','cancelled','modification_requested'].map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {leavesLoading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={leaveColumns} data={leaves} emptyIcon="🏖️" emptyTitle="No leave applications" />}
          </div>
        </div>
      )}

      {/* ── Balance ── */}
      {tab === 'balance' && (
        <div>
          {balLoading ? (
            <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          ) : balances.length === 0 ? (
            <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 48 }}>
              <span style={{ fontSize: 32 }}>📊</span>
              <p style={{ marginTop: 8, color: 'var(--text-muted)' }}>No balance data available</p>
            </div></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {balances.map((b, i) => {
                const allocated = b.totalAllocated || 0;
                const carried   = b.carriedForward  || 0;
                const used      = b.used            || 0;
                const pending   = b.pending         || 0;
                const remaining = b.remaining       ?? Math.max(0, allocated + carried - used - pending);
                const total     = allocated + carried;
                const pct       = total > 0 ? Math.round((used / total) * 100) : 0;

                return (
                  <div key={i} className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '16px 20px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{b.leaveType?.name || '—'}</div>
                          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {b.leaveType?.code} · {b.academicYear}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '1.6rem', fontWeight: 700, color: remaining > 0 ? 'var(--success)' : 'var(--danger)', lineHeight: 1 }}>{remaining}</span>
                          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>remaining</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, background: 'var(--bg-muted)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? 'var(--danger)' : pct > 50 ? 'var(--warning)' : 'var(--success)', transition: 'width .3s' }} />
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, fontSize: '.78rem', textAlign: 'center' }}>
                      {[['Allocated', allocated], ['Carried', carried], ['Used', used], ['Pending', pending]].map(([label, val]) => (
                        <div key={label}><div style={{ fontWeight: 600 }}>{val}</div><div style={{ color: 'var(--text-muted)' }}>{label}</div></div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Apply Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Apply for Leave"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="leave-form" type="submit" loading={saving}>Submit</Button>
        </>}>
        <form id="leave-form" onSubmit={handleApply}>
          <div className="form-group">
            <label className="form-label required">Leave Type</label>
            <select className="form-control" required value={form.leaveTypeId}
              onChange={e => setForm(f => ({ ...f, leaveTypeId: e.target.value }))}>
              <option value="">Select type…</option>
              {leaveTypes.map(t => (
                <option key={t._id} value={t._id}>{t.name} ({t.code}) — {t.annualAllocation} days/yr</option>
              ))}
            </select>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">From</label>
              <input type="date" className="form-control" required value={form.fromDate}
                onChange={e => setForm(f => ({ ...f, fromDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">To</label>
              <input type="date" className="form-control" required value={form.toDate}
                onChange={e => setForm(f => ({ ...f, toDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Leave Mode</label>
            <select className="form-control" value={form.leaveMode}
              onChange={e => setForm(f => ({ ...f, leaveMode: e.target.value }))}>
              <option value="full_day">Full Day</option>
              <option value="half_day">Half Day</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Reason</label>
            <textarea className="form-control" rows={3} required value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="State your reason for leave…" />
          </div>
        </form>
      </Modal>

      {/* ── Cancel Confirm ── */}
      <Confirm open={!!cancelItem} onClose={() => setCancelItem(null)} onConfirm={handleCancel}
        loading={cancLoad} title="Cancel Leave"
        message="Are you sure you want to cancel this leave application?" />
    </div>
  );
}
