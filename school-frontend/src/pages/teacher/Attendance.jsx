import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { getAttendance, markAttendance } from '../../api/teacher.api';
import { PageHeader, Button, Spinner, Badge } from '../../components/ui/index';

const STATUS = ['present', 'absent', 'late', 'half-day'];
const STATUS_COLOR = { present: 'success', absent: 'danger', late: 'warning', 'half-day': 'info' };

export default function TeacherAttendance() {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(today);
  const [students, setStudents] = useState([]);
  const [records, setRecords]   = useState({});
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  const fetchAttendance = async (d) => {
    setLoading(true);
    try {
      const res = await getAttendance({ date: d });
      setStudents(res.data?.students || []);
      const map = {};
      (res.data?.records || []).forEach(r => { map[r.student] = r.status; });
      setRecords(map);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { fetchAttendance(date); }, [date]);

  const toggleStatus = (studentId, status) => {
    setRecords(r => ({ ...r, [studentId]: status }));
  };

  const markAll = (status) => {
    const map = {};
    students.forEach(s => { map[s.user?._id || s._id] = status; });
    setRecords(map);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const recs = students.map(s => ({
        studentId: s.user?._id || s._id,
        status: records[s.user?._id || s._id] || 'absent',
      }));
      await markAttendance({ date, records: recs });
      toast.success('Attendance saved!');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="page">
      <PageHeader title="Mark Attendance" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input type="date" className="form-control" style={{ maxWidth: 200 }}
          value={date} max={today} onChange={e => setDate(e.target.value)} />
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('present')}>✅ All Present</button>
        <button className="btn btn-secondary btn-sm" onClick={() => markAll('absent')}>❌ All Absent</button>
        <div style={{ flex: 1 }} />
        <Button onClick={handleSave} loading={saving}>💾 Save Attendance</Button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {!students.length ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                No students in your section.
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student</th>
                    <th>Roll No</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => {
                    const id  = s.user?._id || s._id;
                    const st  = records[id] || 'absent';
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
                            {STATUS.map(opt => (
                              <button key={opt} onClick={() => toggleStatus(id, opt)}
                                className={`btn btn-sm${st === opt ? ` btn-${opt === 'present' ? 'success' : opt === 'absent' ? 'danger' : opt === 'late' ? 'warning' : 'secondary'}` : ' btn-secondary'}`}
                                style={{ textTransform: 'capitalize', minWidth: 70 }}>
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
    </div>
  );
}
