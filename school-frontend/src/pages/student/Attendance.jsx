import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getMyAttendance, submitCorrection } from '../../api/student.api';
import { PageHeader, Spinner } from '../../components/ui/index';

const STATUS_COLOR = { present: '#10b981', absent: '#ef4444', late: '#f59e0b', 'half-day': '#6366f1' };

export default function StudentAttendance() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year,  setYear]  = useState(today.getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: '', requestedStatus: 'present', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const { data: records, loading } = useFetch(
    () => getMyAttendance({ month, year }),
    [month, year],
  );

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay    = new Date(year, month - 1, 1).getDay();

  const list = Array.isArray(records) ? records : [];
  const recordMap = {};
  list.forEach(r => {
    const d = new Date(r.date).getDate();
    recordMap[d] = r.status;
  });

  const handleSubmitCorrection = async (e) => {
    e.preventDefault();
    if (!form.date || !form.reason) return toast.error('Date and reason are required');
    setSubmitting(true);
    try {
      await submitCorrection(form);
      toast.success('Correction request submitted — awaiting class teacher approval');
      setShowForm(false);
      setForm({ date: '', requestedStatus: 'present', reason: '' });
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSubmitting(false); }
  };

  const present = Object.values(recordMap).filter(s => s === 'present').length;
  const absent  = Object.values(recordMap).filter(s => s === 'absent').length;
  const late    = Object.values(recordMap).filter(s => s === 'late').length;
  const total   = Object.keys(recordMap).length;

  return (
    <div className="page">
      <PageHeader title="My Attendance" subtitle="Monthly attendance calendar"
        action={<button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>Request Correction</button>}
      />

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><strong>Attendance Correction Request</strong></div>
          <div className="card-body">
            <form onSubmit={handleSubmitCorrection}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-control" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Correct status should be *</label>
                  <select className="form-control" value={form.requestedStatus}
                    onChange={e => setForm(f => ({ ...f, requestedStatus: e.target.value }))}>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 8 }}>
                <label className="form-label">Reason *</label>
                <textarea className="form-control" rows={2} value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-control" style={{ maxWidth: 140 }} value={month} onChange={e => setMonth(+e.target.value)}>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => (
            <option key={i} value={i+1}>{m}</option>
          ))}
        </select>
        <select className="form-control" style={{ maxWidth: 100 }} value={year} onChange={e => setYear(+e.target.value)}>
          {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {loading && <Spinner />}
        <span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600 }}>{present} Present</span>
        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 12px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600 }}>{absent} Absent</span>
        {late > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 12px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600 }}>{late} Late</span>}
        {total > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '.85rem', alignSelf: 'center' }}>{Math.round((present/total)*100)}% attendance</span>}
      </div>

      {!loading && (
        <div className="card"><div className="card-body">
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:8 }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
              <div key={d} style={{ textAlign:'center', fontSize:'.75rem', fontWeight:600, color:'var(--text-muted)', padding:'4px 0' }}>{d}</div>
            )}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
            {Array.from({ length: firstDay }).map((_,i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth },(_,i)=>i+1).map(d => {
              const status = recordMap[d];
              return (
                <div key={d} style={{
                  textAlign:'center', padding:'8px 4px', borderRadius:8, fontSize:'.85rem',
                  background: status ? STATUS_COLOR[status]+'20' : 'var(--bg)',
                  border:`1px solid ${status ? STATUS_COLOR[status]+'60' : 'var(--border)'}`,
                  color: status ? STATUS_COLOR[status] : 'var(--text)', fontWeight: status ? 600 : 400,
                }}>
                  {d}
                  {status && <div style={{ fontSize:'.6rem', marginTop:2, textTransform:'capitalize' }}>{status}</div>}
                </div>
              );
            })}
          </div>
        </div></div>
      )}
    </div>
  );
}
