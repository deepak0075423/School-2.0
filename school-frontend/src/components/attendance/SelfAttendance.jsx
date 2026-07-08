import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { Spinner, Button, Modal } from '../ui/index';
import ClockCard from './ClockCard';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_META = {
  present:   { color: '#10b981', label: 'Present' },
  absent:    { color: '#ef4444', label: 'Absent' },
  leave:     { color: '#f59e0b', label: 'Leave' },
  'half-day':{ color: '#6366f1', label: 'Half-Day' },
  holiday:   { color: '#3b82f6', label: 'Holiday' },
  weekend:   { color: '#9ca3af', label: 'Weekend' },
  pending:   { color: '#9ca3af', label: 'Today' },
};

/**
 * Clock in/out self-attendance shared by teachers and school admins.
 * Statuses are derived server-side: clock-in → present, approved leave →
 * leave/half-day, holidays/weekends skipped, unmarked past days → absent.
 *
 * props:
 *   api: { getMyAttendance({month,year}), clockIn(), clockOut() }
 *   regularization: optional { submit(data), list() } — regularization flow
 *     plus the user's own request history
 */
export default function SelfAttendance({ api, regularization }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const [regModal, setRegModal] = useState(false);
  const [regForm,  setRegForm]  = useState({ date: '', checkIn: '', checkOut: '', reason: '' });
  const [regLoad,  setRegLoad]  = useState(false);
  const [dayInfo,  setDayInfo]  = useState(null);   // recorded state of the selected date

  // When a date is picked in the regularization form, look up what that day
  // currently holds so the user can see which punch is missing — and prefill
  // the recorded times so they only need to fix what's wrong.
  useEffect(() => {
    if (!regModal || !regForm.date) { setDayInfo(null); return; }
    const d = new Date(regForm.date + 'T00:00:00');
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getMyAttendance({ month: d.getMonth() + 1, year: d.getFullYear() });
        const days  = res?.data?.days || [];
        const entry = days.find(x => x.day === d.getDate()) || null;
        if (cancelled) return;
        setDayInfo(entry);
        setRegForm(f => ({ ...f, checkIn: entry?.checkIn || '', checkOut: entry?.checkOut || '' }));
      } catch { if (!cancelled) setDayInfo(null); }
    })();
    return () => { cancelled = true; };
  }, [regModal, regForm.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, refetch } = useFetch(
    () => api.getMyAttendance({ month, year }),
    [month, year],
  );

  // The user's own regularization request history
  const { data: regData, refetch: refetchRegs } = useFetch(
    () => (regularization?.list ? regularization.list() : Promise.resolve(null)),
    [],
  );
  const myRequests = regData?.requests || [];

  const days    = data?.days || [];
  const summary = data?.summary || {};

  const isViewingCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const handleReg = async (e) => {
    e.preventDefault();
    if (!regForm.checkIn && !regForm.checkOut)
      return toast.error('Enter the missed clock-in and/or clock-out time');
    setRegLoad(true);
    try {
      await regularization.submit(regForm);
      toast.success('Attendance request submitted for approval');
      setRegModal(false);
      setRegForm({ date: '', checkIn: '', checkOut: '', reason: '' });
      refetchRegs();
    } catch (err) { toast.error(err?.message || 'Failed'); }
    finally { setRegLoad(false); }
  };

  const firstDow = new Date(year, month - 1, 1).getDay();

  return (
    <>
      {/* Clock card — today */}
      {isViewingCurrentMonth && <ClockCard api={api} onChanged={refetch} />}

      {/* Month picker + summary */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-control" style={{ width: 120 }} value={month} onChange={e => setMonth(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className="form-control" style={{ width: 100 }} value={year} onChange={e => setYear(+e.target.value)}>
          {Array.from({ length: 4 }, (_, i) => now.getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {['present', 'absent', 'leave', 'half-day'].map(k => (summary[k] || 0) > 0 && (
          <span key={k} style={{
            background: STATUS_META[k].color + '20', color: STATUS_META[k].color,
            padding: '4px 12px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600,
          }}>{summary[k]} {STATUS_META[k].label}</span>
        ))}
        <div style={{ flex: 1 }} />
        {regularization && (
          <Button variant="secondary" size="sm" onClick={() => setRegModal(true)}>🛠 Attendance Regularization</Button>
        )}
      </div>

      {/* Calendar */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <div className="card"><div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 8 }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '.72rem', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {days.map(d => {
              const meta    = d.status ? STATUS_META[d.status] : null;
              const dimmed  = d.status === 'weekend';
              const pending = d.status === 'pending';
              return (
                <div key={d.day} title={d.label || (meta?.label ?? '')} style={{
                  textAlign: 'center', padding: '8px 4px', borderRadius: 8, fontSize: '.85rem',
                  background: meta && !dimmed && !pending ? meta.color + '18' : 'var(--bg)',
                  border: pending ? '1px dashed var(--primary)' : `1px solid ${meta && !dimmed ? meta.color + '50' : 'var(--border)'}`,
                  color: dimmed ? 'var(--text-muted)' : (meta?.color || 'var(--text)'),
                  fontWeight: meta && !dimmed ? 600 : 400,
                  opacity: dimmed ? 0.6 : 1,
                }}>
                  {d.day}
                  {d.status && !dimmed && (
                    <div style={{ fontSize: '.58rem', marginTop: 2 }}>
                      {pending ? 'today' : STATUS_META[d.status].label}
                    </div>
                  )}
                  {d.checkIn && (
                    <div style={{ fontSize: '.56rem', color: 'var(--text-muted)' }}>
                      {d.checkIn}{d.checkOut ? `–${d.checkOut}` : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14, fontSize: '.75rem', color: 'var(--text-muted)' }}>
            {Object.entries(STATUS_META).filter(([k]) => k !== 'pending').map(([k, m]) => (
              <span key={k}><span style={{ color: m.color }}>■</span> {m.label}</span>
            ))}
            <span style={{ marginLeft: 'auto' }}>Unmarked working days are counted absent automatically · approved leaves apply automatically</span>
          </div>
        </div></div>
      )}

      {/* My regularization requests */}
      {regularization?.list && myRequests.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h3 className="card-title">My Regularization Requests</h3></div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Date</th><th>Requested Times</th><th>Reason</th><th>Status</th><th>Admin Remarks</th></tr></thead>
              <tbody>
                {myRequests.map(r => (
                  <tr key={r._id}>
                    <td>{r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    <td style={{ fontSize: '.85rem' }}>
                      {(r.checkIn || r.checkOut)
                        ? <>{r.checkIn && <>in <strong>{r.checkIn}</strong></>}{r.checkIn && r.checkOut && ' · '}{r.checkOut && <>out <strong>{r.checkOut}</strong></>}</>
                        : <span style={{ textTransform: 'capitalize' }}>{(r.requestedStatus || '—').toLowerCase()}</span>}
                    </td>
                    <td style={{ fontSize: '.85rem' }}>{r.reason || '—'}</td>
                    <td>
                      <span style={{
                        padding: '2px 10px', borderRadius: 99, fontSize: '.78rem', fontWeight: 600,
                        background: r.status === 'approved' ? '#d1fae5' : r.status === 'rejected' ? '#fee2e2' : '#fef3c7',
                        color:      r.status === 'approved' ? '#065f46' : r.status === 'rejected' ? '#991b1b' : '#92400e',
                      }}>{r.status}</span>
                    </td>
                    <td style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{r.adminRemarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attendance regularization modal */}
      {regularization && (
        <Modal open={regModal} onClose={() => setRegModal(false)} title="Attendance Regularization"
          footer={<>
            <Button variant="secondary" onClick={() => setRegModal(false)}>Cancel</Button>
            <Button form="selfatt-reg-form" type="submit" loading={regLoad}>Submit for approval</Button>
          </>}>
          <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Forgot to punch? Enter only the time(s) you missed — just the clock-in, just the clock-out,
            or both. The day is marked present once an admin approves it.
          </p>
          <form id="selfatt-reg-form" onSubmit={handleReg}>
            <div className="form-group">
              <label className="form-label required">Date</label>
              <input type="date" className="form-control" required value={regForm.date}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setRegForm(f => ({ ...f, date: e.target.value }))} />
            </div>

            {/* Current state of the selected day */}
            {regForm.date && dayInfo && (
              <div style={{
                border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
                marginBottom: 14, fontSize: '.85rem', background: 'var(--bg-secondary)',
              }}>
                {dayInfo.status === 'present' || dayInfo.checkIn ? (
                  <>📌 Recorded on this day — clock-in: <strong>{dayInfo.checkIn || '— missing'}</strong> · clock-out: <strong>{dayInfo.checkOut || '— missing'}</strong></>
                ) : dayInfo.status === 'absent' ? (
                  <>📌 No punches recorded — this day is currently counted <strong style={{ color: 'var(--danger, #ef4444)' }}>absent</strong>.</>
                ) : dayInfo.status === 'leave' || dayInfo.status === 'half-day' ? (
                  <>📌 You are on approved leave this day ({dayInfo.label || 'Leave'}) — no regularization needed.</>
                ) : dayInfo.status === 'holiday' ? (
                  <>📌 This day is a holiday ({dayInfo.label || 'Holiday'}) — no regularization needed.</>
                ) : dayInfo.status === 'weekend' ? (
                  <>📌 This is a non-working day.</>
                ) : dayInfo.status === 'pending' ? (
                  <>📌 Today — no punches yet. You can still use the Clock In button instead.</>
                ) : (
                  <>📌 Nothing recorded on this day yet.</>
                )}
              </div>
            )}

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Clock-In Time</label>
                <input type="time" className="form-control" value={regForm.checkIn}
                  onChange={e => setRegForm(f => ({ ...f, checkIn: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Clock-Out Time</label>
                <input type="time" className="form-control" value={regForm.checkOut}
                  onChange={e => setRegForm(f => ({ ...f, checkOut: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label required">Reason</label>
              <textarea className="form-control" rows={3} required value={regForm.reason}
                onChange={e => setRegForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Was at school but forgot to clock in" />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
