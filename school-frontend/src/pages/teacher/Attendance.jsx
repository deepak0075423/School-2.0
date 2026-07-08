import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getAttendance, markAttendance,
  getMyAttendance, clockIn, clockOut, submitRegularization, getMyRegularizations,
  getCorrectionRequests, reviewCorrection,
} from '../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../components/ui/index';
import SelfAttendance from '../../components/attendance/SelfAttendance';

const STATUS_COLORS = { present: '#10b981', absent: '#ef4444' };
const STATUS_OPTS   = ['present', 'absent'];
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Tab 1: Mark Student Attendance (class teacher / vice class teacher) ───────
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
                                style={{ textTransform: 'capitalize', minWidth: 84,
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

// ── Tab 3: Student Correction Requests ────────────────────────────────────────
function CorrectionRequests() {
  const [actLoad, setActLoad] = useState(null);
  const { data, loading, refetch } = useFetch(getCorrectionRequests);
  const requests = Array.isArray(data) ? data : [];

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
    { key: 'requested', label: 'Requested', render: r => <span style={{ textTransform: 'capitalize' }}>{r.requestedStatus || '—'}</span> },
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
      <PageHeader title="Attendance" subtitle="Mark your section and clock your own day" />
      <div className="tabs">
        <button className={`tab${tab === 'mark' ? ' active' : ''}`}    onClick={() => setTab('mark')}>Mark Students</button>
        <button className={`tab${tab === 'mine' ? ' active' : ''}`}    onClick={() => setTab('mine')}>My Attendance</button>
        <button className={`tab${tab === 'correct' ? ' active' : ''}`} onClick={() => setTab('correct')}>Student Corrections</button>
      </div>
      {tab === 'mark'    && <MarkAttendance />}
      {tab === 'mine'    && (
        <SelfAttendance
          api={{ getMyAttendance, clockIn, clockOut }}
          regularization={{ submit: submitRegularization, list: getMyRegularizations }}
        />
      )}
      {tab === 'correct' && <CorrectionRequests />}
    </div>
  );
}
