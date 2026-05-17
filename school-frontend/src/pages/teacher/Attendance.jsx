import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getAttendance, markAttendance,
  getMyAttendance, markMyAttendance, submitRegularization,
  getCorrectionRequests, reviewCorrection,
} from '../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner } from '../../components/ui/index';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const STATUS_COLORS = { present: '#10b981', absent: '#ef4444', late: '#f59e0b', 'half-day': '#6366f1' };
const STATUS_OPTS   = ['present', 'absent', 'late', 'half-day'];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Tab 1: Mark Student Attendance ────────────────────────────────────────────
function MarkAttendance() {
  const today = new Date().toISOString().split('T')[0];
  const [date,     setDate]     = useState(today);
  const [students, setStudents] = useState([]);
  const [records,  setRecords]  = useState({});
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const fetchAttendance = async (d) => {
    setLoading(true);
    try {
      const res = await getAttendance({ date: d });
      setStudents(res?.data?.students || []);
      const map = {};
      (res?.data?.records || []).forEach(r => { map[String(r.student)] = r.status; });
      setRecords(map);
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAttendance(date); }, [date]);

  const markAll = (status) => {
    const map = {};
    students.forEach(s => { map[String(s.user?._id || s._id)] = status; });
    setRecords(map);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const recs = students.map(s => ({
        studentId: s.user?._id || s._id,
        status: records[String(s.user?._id || s._id)] || 'absent',
      }));
      await markAttendance({ date, records: recs });
      toast.success('Attendance saved!');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="date" className="form-control" style={{ maxWidth: 200 }}
          value={date} max={today} onChange={e => setDate(e.target.value)} />
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('present')}>All Present</button>
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('absent')}>All Absent</button>
        <div style={{ flex: 1 }} />
        <Button onClick={handleSave} loading={saving}>Save Attendance</Button>
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {!students.length ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>No students in your section.</div>
            ) : (
              <table className="table">
                <thead><tr><th>#</th><th>Student</th><th>Roll No</th><th>Status</th></tr></thead>
                <tbody>
                  {students.map((s, i) => {
                    const id = String(s.user?._id || s._id);
                    const st = records[id] || 'absent';
                    return (
                      <tr key={id}>
                        <td>{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar avatar-sm">{(s.user?.name || s.name)?.[0]}</div>
                            <span>{s.user?.name || s.name}</span>
                          </div>
                        </td>
                        <td>{s.rollNumber || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {STATUS_OPTS.map(opt => (
                              <button key={opt}
                                onClick={() => setRecords(r => ({ ...r, [id]: opt }))}
                                style={{ textTransform: 'capitalize', minWidth: 72,
                                  background: st === opt ? STATUS_COLORS[opt] : undefined,
                                  color: st === opt ? '#fff' : undefined,
                                  borderColor: STATUS_COLORS[opt],
                                }}
                                className={`btn btn-sm ${st === opt ? '' : 'btn-secondary'}`}>
                                {opt}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Tab 2: My Attendance (calendar + self-mark + regularization) ──────────────
function MyAttendance() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year,  setYear]  = useState(today.getFullYear());
  const [markModal,  setMarkModal]  = useState(false);
  const [regModal,   setRegModal]   = useState(false);
  const [markForm,   setMarkForm]   = useState({ date: today.toISOString().split('T')[0], status: 'present', checkIn: '', checkOut: '' });
  const [regForm,    setRegForm]    = useState({ date: '', reason: '', checkIn: '', checkOut: '' });
  const [markLoad,   setMarkLoad]   = useState(false);
  const [regLoad,    setRegLoad]    = useState(false);

  const { data, loading, refetch } = useFetch(
    () => getMyAttendance({ month, year }),
    [month, year],
  );
  const records = data?.data || [];

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay    = new Date(year, month - 1, 1).getDay();
  const recordMap   = {};
  records.forEach(r => { recordMap[new Date(r.date).getDate()] = r; });

  const present = records.filter(r => r.status === 'present').length;
  const absent  = records.filter(r => r.status === 'absent').length;
  const late    = records.filter(r => r.status === 'late').length;

  const handleMark = async (e) => {
    e.preventDefault();
    setMarkLoad(true);
    try {
      await markMyAttendance(markForm);
      toast.success('Attendance marked');
      setMarkModal(false);
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setMarkLoad(false); }
  };

  const handleReg = async (e) => {
    e.preventDefault();
    setRegLoad(true);
    try {
      await submitRegularization(regForm);
      toast.success('Regularization request submitted');
      setRegModal(false);
      setRegForm({ date: '', reason: '', checkIn: '', checkOut: '' });
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setRegLoad(false); }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-control" style={{ width: 120 }} value={month} onChange={e => setMonth(+e.target.value)}>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className="form-control" style={{ width: 100 }} value={year} onChange={e => setYear(+e.target.value)}>
          {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600 }}>{present} Present</span>
        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 12px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600 }}>{absent} Absent</span>
        {late > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 12px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600 }}>{late} Late</span>}
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={() => setMarkModal(true)}>Mark Today</Button>
        <Button variant="secondary" size="sm" onClick={() => setRegModal(true)}>Request Regularization</Button>
      </div>

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
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const rec    = recordMap[d];
              const color  = rec ? STATUS_COLORS[rec.status] : null;
              return (
                <div key={d} style={{
                  textAlign: 'center', padding: '8px 4px', borderRadius: 8, fontSize: '.85rem',
                  background: color ? color + '20' : 'var(--bg)',
                  border: `1px solid ${color ? color + '60' : 'var(--border)'}`,
                  color: color || 'var(--text)', fontWeight: rec ? 600 : 400,
                }}>
                  {d}
                  {rec && <div style={{ fontSize: '.6rem', marginTop: 2, textTransform: 'capitalize' }}>{rec.status}</div>}
                  {rec?.checkIn && <div style={{ fontSize: '.58rem', color: 'var(--text-muted)' }}>{rec.checkIn}</div>}
                </div>
              );
            })}
          </div>
        </div></div>
      )}

      {/* Mark Today Modal */}
      <Modal open={markModal} onClose={() => setMarkModal(false)} title="Mark My Attendance"
        footer={<><Button variant="secondary" onClick={() => setMarkModal(false)}>Cancel</Button>
          <Button form="mark-form" type="submit" loading={markLoad}>Save</Button></>}>
        <form id="mark-form" onSubmit={handleMark}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" className="form-control" value={markForm.date}
                onChange={e => setMarkForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={markForm.status}
                onChange={e => setMarkForm(f => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTS.map(s => <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Check-In Time</label>
              <input type="time" className="form-control" value={markForm.checkIn}
                onChange={e => setMarkForm(f => ({ ...f, checkIn: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Check-Out Time</label>
              <input type="time" className="form-control" value={markForm.checkOut}
                onChange={e => setMarkForm(f => ({ ...f, checkOut: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>

      {/* Regularization Modal */}
      <Modal open={regModal} onClose={() => setRegModal(false)} title="Request Regularization"
        footer={<><Button variant="secondary" onClick={() => setRegModal(false)}>Cancel</Button>
          <Button form="reg-form" type="submit" loading={regLoad}>Submit</Button></>}>
        <form id="reg-form" onSubmit={handleReg}>
          <div className="form-group">
            <label className="form-label required">Date</label>
            <input type="date" className="form-control" required value={regForm.date}
              onChange={e => setRegForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Check-In Time</label>
              <input type="time" className="form-control" value={regForm.checkIn}
                onChange={e => setRegForm(f => ({ ...f, checkIn: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Check-Out Time</label>
              <input type="time" className="form-control" value={regForm.checkOut}
                onChange={e => setRegForm(f => ({ ...f, checkOut: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Reason</label>
            <textarea className="form-control" rows={3} required value={regForm.reason}
              onChange={e => setRegForm(f => ({ ...f, reason: e.target.value }))} placeholder="Explain the reason for regularization…" />
          </div>
        </form>
      </Modal>
    </>
  );
}

// ── Tab 3: Student Correction Requests ────────────────────────────────────────
function CorrectionRequests() {
  const [actLoad, setActLoad] = useState(null);
  const { data, loading, refetch } = useFetch(getCorrectionRequests);
  const requests = data?.data || [];

  const handleReview = async (id, status) => {
    setActLoad(id);
    try {
      await reviewCorrection({ id, status });
      toast.success(status === 'approved' ? 'Approved' : 'Rejected');
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setActLoad(null); }
  };

  const columns = [
    { key: 'student', label: 'Student',  render: r => r.student?.name || '—' },
    { key: 'date',    label: 'Date',     render: r => fmtDate(r.date) },
    { key: 'reason',  label: 'Reason',   render: r => <span style={{ fontSize: '.85rem' }}>{r.reason || '—'}</span> },
    { key: 'status',  label: 'Status',
      render: r => <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge> },
    { key: 'actions', label: '',
      render: r => r.status === 'pending' && (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button size="sm" loading={actLoad === r._id} onClick={() => handleReview(r._id, 'approved')}>Approve</Button>
          <button className="btn btn-danger btn-sm" onClick={() => handleReview(r._id, 'rejected')}>Reject</button>
        </div>
      )},
  ];

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0 }}>
        {loading
          ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
          : <Table columns={columns} data={requests} emptyIcon="✅" emptyTitle="No correction requests" />}
      </div>
    </div>
  );
}

export default function TeacherAttendance() {
  const [tab, setTab] = useState('mark');
  return (
    <div className="page">
      <PageHeader title="Attendance" />
      <div className="tabs">
        <button className={`tab${tab === 'mark' ? ' active' : ''}`}    onClick={() => setTab('mark')}>Mark Students</button>
        <button className={`tab${tab === 'mine' ? ' active' : ''}`}    onClick={() => setTab('mine')}>My Attendance</button>
        <button className={`tab${tab === 'correct' ? ' active' : ''}`} onClick={() => setTab('correct')}>Student Corrections</button>
      </div>
      {tab === 'mark'    && <MarkAttendance />}
      {tab === 'mine'    && <MyAttendance />}
      {tab === 'correct' && <CorrectionRequests />}
    </div>
  );
}
