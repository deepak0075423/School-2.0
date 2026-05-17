import React, { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getMyLeaves, getLeaveBalance, applyLeave, cancelLeave, getHolidays, getModules } from '../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS_VARIANT = {
  pending: 'warning', approved: 'success', rejected: 'danger',
  cancelled: 'muted', modification_requested: 'info',
};

const EMPTY_FORM = { leaveTypeId: '', fromDate: '', toDate: '', leaveMode: 'full_day', reason: '' };

// ── Day counting helpers ──────────────────────────────────────────────────────

function getNthSaturdayOfMonth(date) {
  return Math.ceil(date.getDate() / 7);
}

function isSaturdayWorking(date, leaveSettings = {}) {
  const { saturdayWorking = true, saturdayMode = 'all' } = leaveSettings;
  if (!saturdayWorking) return false;
  if (saturdayMode === 'all') return true;
  const nth = getNthSaturdayOfMonth(date);
  if (saturdayMode === '1_3_5') return nth % 2 === 1;
  if (saturdayMode === '2_4')   return nth % 2 === 0;
  return true;
}

function estimateDays(fromDate, toDate, leaveMode, leaveSettings = {}, holidaySet = new Set()) {
  if (leaveMode === 'half_day') return 0.5;
  if (!fromDate || !toDate) return 0;
  const from = new Date(fromDate);
  const to   = new Date(toDate);
  if (to < from) return 0;
  const { saturdayHalfDay = false } = leaveSettings;
  let days = 0;
  const cur = new Date(from);
  while (cur <= to) {
    const dow     = cur.getDay();
    const dateStr = cur.toISOString().slice(0, 10);
    if (holidaySet.has(dateStr)) {
      // skip — holiday
    } else if (dow === 6) {
      if (isSaturdayWorking(cur, leaveSettings)) days += saturdayHalfDay ? 0.5 : 1;
    } else if (dow !== 0) {
      days += 1;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ── Component ─────────────────────────────────────────────────────────────────

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
  // axios interceptor unwraps res.data, so useFetch receives { items, leaveSettings, academicYear }
  const balances      = balData?.items ?? [];
  const leaveSettings = balData?.leaveSettings || {};

  // Fetch holidays only if holiday module is enabled for this school
  const [holidays, setHolidays] = useState([]);
  useEffect(() => {
    getModules()
      .then(res => {
        const mods = res?.data ?? res;
        if (!mods?.holiday) return null;
        return getHolidays();
      })
      .then(res => {
        if (!res) return;
        const d = res?.data ?? res;
        setHolidays(Array.isArray(d) ? d : []);
      })
      .catch(() => {});
  }, []);

  // Build a Set of YYYY-MM-DD strings covering every holiday date range
  const holidaySet = useMemo(() => {
    const set = new Set();
    holidays.forEach(h => {
      const cur = new Date(h.startDate);
      const end = new Date(h.endDate || h.startDate);
      while (cur <= end) {
        set.add(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
    });
    return set;
  }, [holidays]);

  // keyed by leaveType._id for O(1) lookup
  const balanceMap = Object.fromEntries(
    balances.map(b => [b.leaveType?._id?.toString() || b.leaveType?.toString(), b])
  );

  const leaveTypes = balances.map(b => b.leaveType).filter(Boolean);

  useEffect(() => {
    if (tab === 'balance')   refetchBal();
    if (tab === 'my-leaves') refetch();
  }, [tab]);

  // ── Apply Leave ───────────────────────────────────────────────────────────────
  const [modal,  setModal]  = useState(false);
  const [form,   setForm]   = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const docRef = useRef();

  const selLT      = leaveTypes.find(t => String(t._id) === form.leaveTypeId);
  const selBal     = balanceMap[form.leaveTypeId] ?? null;
  const remaining  = selBal ? (selBal.remaining ?? Math.max(0, (selBal.totalAllocated || 0) + (selBal.carriedForward || 0) - (selBal.used || 0) - (selBal.pending || 0))) : null;
  const estDays    = estimateDays(form.fromDate, form.toDate, form.leaveMode, leaveSettings, holidaySet);
  const noWorkDays = form.leaveMode !== 'half_day' && form.fromDate && form.toDate && form.fromDate <= form.toDate && estDays === 0;
  const overBalance = remaining !== null && estDays > 0 && estDays > remaining;
  const overConsec  = selLT?.maxConsecutiveDays > 0 && estDays > selLT.maxConsecutiveDays && form.leaveMode !== 'half_day';

  const docRequired = !!selLT?.requiresDocument && (
    selLT.documentRequiredAfterDays > 0
      ? estDays >= selLT.documentRequiredAfterDays
      : true
  );

  // Auto-sync toDate for half-day and keep toDate >= fromDate
  const setField = (key, val) => {
    setForm(f => {
      const next = { ...f, [key]: val };
      // half-day: lock toDate to fromDate
      if (next.leaveMode === 'half_day') next.toDate = next.fromDate;
      // if fromDate moved past toDate, reset toDate
      if (key === 'fromDate' && next.toDate && next.toDate < val) next.toDate = val;
      return next;
    });
    setErrors(e => ({ ...e, [key]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.leaveTypeId)          e.leaveTypeId = 'Please select a leave type.';
    if (!form.fromDate)             e.fromDate    = 'From date is required.';
    if (!form.toDate)               e.toDate      = 'To date is required.';
    if (form.fromDate && form.toDate && form.toDate < form.fromDate)
                                    e.toDate      = 'To date must be on or after From date.';
    if (form.fromDate && form.fromDate < todayStr())
                                    e.fromDate    = 'Cannot apply leave for a past date.';
    if (form.leaveMode === 'half_day' && form.fromDate && form.toDate && form.fromDate !== form.toDate)
                                    e.toDate      = 'Half-day leave must start and end on the same date.';
    if (noWorkDays)                 e.toDate      = 'The selected range has no working days (weekends / holidays only).';
    if (overBalance)                e.leaveTypeId = `Insufficient balance — you have ${remaining} day(s) remaining but are applying for ${estDays}.`;
    if (overConsec)                 e.toDate      = `This leave type allows a maximum of ${selLT.maxConsecutiveDays} consecutive day(s).`;
    if (!form.reason.trim())        e.reason      = 'Reason is required.';
    else if (form.reason.trim().length < 10)
                                    e.reason      = 'Reason must be at least 10 characters.';
    if (docRequired && !docRef.current?.files?.[0])
                                    e.document    = 'Supporting document is required for this leave.';
    return e;
  };

  const openModal = () => { setForm(EMPTY_FORM); setErrors({}); setModal(true); };

  const handleApply = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('leaveTypeId', form.leaveTypeId);
      fd.append('fromDate',    form.fromDate);
      fd.append('toDate',      form.toDate);
      fd.append('leaveMode',   form.leaveMode);
      fd.append('reason',      form.reason);
      if (docRef.current?.files?.[0]) fd.append('document', docRef.current.files[0]);
      await applyLeave(fd);
      toast.success('Leave application submitted');
      setModal(false); setForm(EMPTY_FORM); setErrors({});
      if (docRef.current) docRef.current.value = '';
      refetch(); refetchBal();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to submit');
    } finally { setSaving(false); }
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
    { key: 'doc',     label: 'Doc', render: r => r.document ? <a href={`/uploads/leave-docs/${r.document}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>📎 View</a> : '—' },
    { key: 'actions', label: '', render: r => (r.status === 'pending' || r.status === 'modification_requested') ? (
      <button className="btn btn-danger btn-sm" onClick={() => setCancelItem(r)}>Cancel</button>
    ) : null },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <PageHeader title="My Leave" subtitle="Leave applications and balance"
        action={<Button onClick={openModal}>+ Apply Leave</Button>}
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
            {leavesLoading
              ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
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
                const rem       = b.remaining ?? Math.max(0, allocated + carried - used - pending);
                const total     = allocated + carried;
                const pct       = total > 0 ? Math.round((used / total) * 100) : 0;
                return (
                  <div key={i} className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '16px 20px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{b.leaveType?.name || '—'}</div>
                          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{b.leaveType?.code} · {b.academicYear}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '1.6rem', fontWeight: 700, color: rem > 0 ? 'var(--success)' : 'var(--danger)', lineHeight: 1 }}>{rem}</span>
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
        <form id="leave-form" onSubmit={handleApply} noValidate>

          {/* Leave Type */}
          <div className="form-group">
            <label className="form-label required">Leave Type</label>
            {leaveTypes.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', margin: 0 }}>
                No leave types available. Please contact your administrator.
              </p>
            ) : (
              <select
                className={`form-control${errors.leaveTypeId ? ' is-invalid' : ''}`}
                value={form.leaveTypeId}
                onChange={e => setField('leaveTypeId', e.target.value)}
              >
                <option value="">Select type…</option>
                {leaveTypes.map(t => {
                  const bal = balanceMap[t._id?.toString()];
                  const rem = bal
                    ? (bal.remaining ?? Math.max(0, (bal.totalAllocated || 0) + (bal.carriedForward || 0) - (bal.used || 0) - (bal.pending || 0)))
                    : (t.annualAllocation || 0);
                  return (
                    <option key={t._id} value={t._id} disabled={rem <= 0}>
                      {t.name} ({t.code}) — {rem} day(s) remaining{rem <= 0 ? ' · No balance' : ''}
                    </option>
                  );
                })}
              </select>
            )}
            {errors.leaveTypeId && <div className="invalid-feedback" style={{ display: 'block', color: 'var(--danger)', fontSize: '.8rem', marginTop: 4 }}>{errors.leaveTypeId}</div>}

            {/* Inline balance info for selected type */}
            {selBal && (
              <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: '.78rem', color: 'var(--text-muted)' }}>
                <span>Allocated: <strong>{selBal.totalAllocated}</strong></span>
                <span>Used: <strong>{selBal.used}</strong></span>
                <span>Pending: <strong>{selBal.pending}</strong></span>
                <span style={{ color: remaining > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>Remaining: {remaining}</span>
              </div>
            )}
          </div>

          {/* Leave Mode */}
          <div className="form-group">
            <label className="form-label">Leave Mode</label>
            <select className="form-control" value={form.leaveMode}
              onChange={e => setField('leaveMode', e.target.value)}>
              <option value="full_day">Full Day</option>
              <option value="half_day">Half Day</option>
            </select>
          </div>

          {/* Dates */}
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">From</label>
              <input
                type="date" className={`form-control${errors.fromDate ? ' is-invalid' : ''}`}
                required min={todayStr()} value={form.fromDate}
                onChange={e => setField('fromDate', e.target.value)}
              />
              {errors.fromDate && <div style={{ color: 'var(--danger)', fontSize: '.8rem', marginTop: 4 }}>{errors.fromDate}</div>}
            </div>
            <div className="form-group">
              <label className="form-label required">To</label>
              <input
                type="date" className={`form-control${errors.toDate ? ' is-invalid' : ''}`}
                required
                min={form.fromDate || todayStr()}
                value={form.toDate}
                disabled={form.leaveMode === 'half_day'}
                onChange={e => setField('toDate', e.target.value)}
              />
              {errors.toDate && <div style={{ color: 'var(--danger)', fontSize: '.8rem', marginTop: 4 }}>{errors.toDate}</div>}
            </div>
          </div>

          {/* Day count pill */}
          {form.fromDate && form.toDate && form.fromDate <= form.toDate && (
            <div style={{ marginTop: -8, marginBottom: 12 }}>
              {noWorkDays ? (
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: 'var(--danger-light, #fee2e2)', color: 'var(--danger)', fontSize: '.78rem', fontWeight: 600 }}>
                  ⚠ No working days in this range
                </span>
              ) : (
                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: 'var(--primary-light, #ede9fe)', color: 'var(--primary)', fontSize: '.78rem', fontWeight: 600 }}>
                  {estDays === 0.5 ? 'Half day' : `${estDays} working day${estDays !== 1 ? 's' : ''}`}
                </span>
              )}
              {overBalance && !noWorkDays && (
                <span style={{ display: 'inline-block', marginLeft: 8, padding: '3px 10px', borderRadius: 20, background: 'var(--danger-light, #fee2e2)', color: 'var(--danger)', fontSize: '.78rem', fontWeight: 600 }}>
                  ⚠ Exceeds balance ({remaining} remaining)
                </span>
              )}
              {overConsec && !noWorkDays && (
                <span style={{ display: 'inline-block', marginLeft: 8, padding: '3px 10px', borderRadius: 20, background: 'var(--danger-light, #fee2e2)', color: 'var(--danger)', fontSize: '.78rem', fontWeight: 600 }}>
                  ⚠ Max {selLT.maxConsecutiveDays} consecutive day(s)
                </span>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="form-group">
            <label className="form-label required">Reason</label>
            <textarea
              className={`form-control${errors.reason ? ' is-invalid' : ''}`}
              rows={3} required value={form.reason}
              onChange={e => setField('reason', e.target.value)}
              placeholder="State your reason for leave… (min 10 characters)"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              {errors.reason
                ? <span style={{ color: 'var(--danger)', fontSize: '.8rem' }}>{errors.reason}</span>
                : <span />}
              <span style={{ fontSize: '.75rem', color: form.reason.length < 10 ? 'var(--text-muted)' : 'var(--success)' }}>
                {form.reason.length} / 10 min
              </span>
            </div>
          </div>

          {/* Supporting Document */}
          <div className="form-group">
            <label className="form-label">
              Supporting Document
              {docRequired
                ? <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>
                : <span style={{ color: 'var(--text-muted)', fontSize: '.8rem', marginLeft: 4 }}>(optional)</span>}
            </label>
            <input ref={docRef} type="file"
              className={`form-control${errors.document ? ' is-invalid' : ''}`}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={() => setErrors(e => ({ ...e, document: '' }))}
            />
            {errors.document && <div style={{ color: 'var(--danger)', fontSize: '.8rem', marginTop: 4 }}>{errors.document}</div>}
            <span style={{ fontSize: '.75rem', color: docRequired ? 'var(--danger)' : 'var(--text-muted)' }}>
              {selLT?.requiresDocument && selLT.documentRequiredAfterDays > 0
                ? `Required for ${selLT.documentRequiredAfterDays}+ days${estDays > 0 ? ` (you selected ${estDays} day(s))` : ''}`
                : selLT?.requiresDocument
                  ? 'Always required for this leave type'
                  : 'PDF, Word, or image — max 5 MB'}
            </span>
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
