import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner, Confirm } from '../../components/ui/index';

const TYPE_ORDER  = ['theory', 'practical', 'elective'];
const TYPE_LABEL  = { theory: 'Theory', practical: 'Practical', elective: 'Elective' };
const TYPE_COLOR  = { theory: 'var(--primary)', practical: 'var(--success)', elective: 'var(--warning)' };

function TeacherCard({ label, teacher, onAssign, badgeVariant = 'success' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="avatar avatar-sm" style={{ background: badgeVariant === 'warning' ? 'var(--warning)' : 'var(--primary)' }}>
          {teacher ? teacher.name?.[0] : '?'}
        </div>
        <div>
          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
          {teacher
            ? <>
                <div style={{ fontWeight: 600 }}>{teacher.name}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{teacher.email}</div>
              </>
            : <div style={{ color: 'var(--text-muted)', fontSize: '.87rem' }}>Not assigned</div>
          }
        </div>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={onAssign}>
        {teacher ? 'Change' : 'Assign'}
      </button>
    </div>
  );
}

export default function SectionDetail() {
  const { id } = useParams();
  const { data: section, loading: loadSec, refetch: refetchSec } = useFetch(() => api.getSectionDetail(id), [id]);
  const { data: sst,     loading: loadSST, refetch: refetchSST } = useFetch(() => api.getSectionSubjectTeachers(id), [id]);
  const { data: teacherList } = useFetch(() => api.getTeachers({ limit: 200 }));
  const { data: subjects }    = useFetch(api.getSubjects);

  // Teacher assignment modal (shared for class teacher + vice teacher)
  const [teacherModal, setTeacherModal]   = useState(false);
  const [teacherRole, setTeacherRole]     = useState('class'); // 'class' | 'vice'
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [savingTeacher, setSavingTeacher] = useState(false);

  // Subject assignment modal
  const [subjectModal, setSubjectModal]   = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [subjectForm, setSubjectForm]     = useState({ subject: '', teacher: '' });

  const openTeacherModal = (role) => {
    setTeacherRole(role);
    setSelectedTeacher(
      role === 'class' ? (section?.classTeacher?._id || '') : (section?.substituteTeacher?._id || '')
    );
    setTeacherModal(true);
  };

  const handleAssignTeacher = async (e) => {
    e.preventDefault();
    setSavingTeacher(true);
    try {
      const payload = teacherRole === 'class'
        ? { teacherId:     selectedTeacher }
        : { viceTeacherId: selectedTeacher };
      await api.updateSectionTeacher(id, payload);
      toast.success(teacherRole === 'class' ? 'Class teacher assigned' : 'Vice teacher assigned');
      setTeacherModal(false);
      refetchSec();
    } catch (err) { toast.error(err.message); }
    finally { setSavingTeacher(false); }
  };

  const handleAssignSubject = async (e) => {
    e.preventDefault();
    setSavingSubject(true);
    try {
      await api.assignSectionSubjectTeacher(id, subjectForm);
      toast.success('Subject assigned');
      setSubjectModal(false);
      setSubjectForm({ subject: '', teacher: '' });
      refetchSST();
    } catch (err) { toast.error(err.message); }
    finally { setSavingSubject(false); }
  };

  const [unassignConfirm, setUnassignConfirm] = useState(null); // { subjectId, teacherId, teacherName, subjectName }
  const [unassigning, setUnassigning]         = useState(false);

  // Student enrollment
  const [studentModal, setStudentModal]         = useState(false);
  const [studentSearch, setStudentSearch]       = useState('');
  const [studentResults, setStudentResults]     = useState([]);
  const [studentSearching, setStudentSearching] = useState(false);
  const [enrollingId, setEnrollingId]           = useState(null);
  const [removeStudentConfirm, setRemoveStudentConfirm] = useState(null);
  const [removingStudent, setRemovingStudent]   = useState(false);
  const studentSearchTimer = React.useRef(null);

  const handleUnassignTeacher = async () => {
    setUnassigning(true);
    try {
      await api.removeSectionSubjectTeacher(id, unassignConfirm.subjectId, unassignConfirm.teacherId);
      toast.success('Teacher unassigned');
      setUnassignConfirm(null);
      refetchSST();
    } catch (err) { toast.error(err.message); }
    finally { setUnassigning(false); }
  };

  const handleStudentSearch = (val) => {
    setStudentSearch(val);
    setStudentResults([]);
    clearTimeout(studentSearchTimer.current);
    if (!val.trim()) return;
    studentSearchTimer.current = setTimeout(async () => {
      setStudentSearching(true);
      try {
        const res = await api.getStudents({ search: val.trim(), limit: 10 });
        setStudentResults(res?.data?.data || []);
      } catch {} finally { setStudentSearching(false); }
    }, 350);
  };

  const handleEnrollStudent = async (studentId, studentName) => {
    setEnrollingId(studentId);
    try {
      await api.assignStudentToSection(id, studentId);
      toast.success(`${studentName} enrolled`);
      setStudentModal(false);
      setStudentSearch('');
      setStudentResults([]);
      refetchSec();
    } catch (err) { toast.error(err.message); }
    finally { setEnrollingId(null); }
  };

  const handleRemoveStudent = async () => {
    setRemovingStudent(true);
    try {
      await api.removeStudentFromSection(id, removeStudentConfirm._id);
      toast.success(`${removeStudentConfirm.name} removed`);
      setRemoveStudentConfirm(null);
      refetchSec();
    } catch (err) { toast.error(err.message); }
    finally { setRemovingStudent(false); }
  };

  // Group subjects by type
  const groupedSST = (() => {
    if (!sst?.length) return [];
    const subjectMap = {};
    sst.forEach(row => {
      const sid = row.subject?._id;
      if (!subjectMap[sid]) subjectMap[sid] = { subject: row.subject, teachers: [] };
      if (row.teacher) subjectMap[sid].teachers.push(row.teacher);
    });
    const typeMap = {};
    Object.values(subjectMap).forEach(entry => {
      const type = entry.subject?.type || 'theory';
      if (!typeMap[type]) typeMap[type] = [];
      typeMap[type].push(entry);
    });
    return TYPE_ORDER.filter(t => typeMap[t]).map(t => ({ type: t, rows: typeMap[t] }));
  })();

  const teachers = teacherList?.data || teacherList || [];
  const selectedSubject = (subjects || []).find(s => s._id === subjectForm.subject);
  const alreadyAssigned = new Set(
    (sst || []).filter(r => r.subject?._id === subjectForm.subject).map(r => r.teacher?._id).filter(Boolean)
  );
  const subjectTeachers = (selectedSubject?.teachers || []).filter(t => !alreadyAssigned.has(t._id));
  const enrolled = section?.enrolledStudents || [];

  if (loadSec) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <div className="breadcrumb" style={{ marginBottom: 12, fontSize: '.85rem', color: 'var(--text-muted)' }}>
        <Link to="/admin/classes" style={{ color: 'var(--primary)' }}>Classes</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>Section {section?.sectionName}</span>
      </div>

      <PageHeader title={`Section ${section?.sectionName || ''}`}
        subtitle={`${section?.currentCount ?? 0} / ${section?.maxStudents ?? 40} students enrolled`} />

      {/* ── Teachers card ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 style={{ margin: 0 }}>Teachers</h3>
        </div>
        <div className="card-body" style={{ paddingBottom: 4 }}>
          <TeacherCard
            label="Class Teacher"
            teacher={section?.classTeacher}
            onAssign={() => openTeacherModal('class')}
          />
          <TeacherCard
            label="Vice Class Teacher"
            teacher={section?.substituteTeacher}
            onAssign={() => openTeacherModal('vice')}
            badgeVariant="warning"
          />
        </div>
      </div>

      {/* ── Subjects grouped by type ──────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Subject Teachers</h3>
          <Button onClick={() => setSubjectModal(true)}>+ Assign Subject</Button>
        </div>
        <div className="card-body" style={{ padding: loadSST ? 32 : 0 }}>
          {loadSST
            ? <div style={{ display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : !sst?.length
              ? <div style={{ padding: '24px 20px', color: 'var(--text-muted)', fontSize: '.9rem' }}>No subjects assigned yet.</div>
              : groupedSST.map(({ type, rows }) => (
                <div key={type}>
                  <div style={{
                    padding: '8px 20px', fontSize: '.75rem', fontWeight: 700, letterSpacing: '.05em',
                    textTransform: 'uppercase', color: TYPE_COLOR[type],
                    background: 'var(--bg)', borderBottom: '1px solid var(--border)',
                  }}>
                    {TYPE_LABEL[type]} ({rows.length})
                  </div>
                  <Table
                    columns={[
                      { key: 'subject',  label: 'Subject',  render: r => <strong>{r.subject?.subjectName || '—'}</strong> },
                      { key: 'code',     label: 'Code',     render: r => r.subject?.subjectCode || '—' },
                      { key: 'teachers', label: 'Teachers', render: r => r.teachers.length
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {r.teachers.map(t => (
                              <span key={t._id} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                background: 'var(--bg)', border: '1px solid var(--border)',
                                borderRadius: 4, padding: '2px 6px 2px 8px', fontSize: '.78rem',
                              }}>
                                {t.name}
                                <button
                                  onClick={() => setUnassignConfirm({ subjectId: r.subject._id, teacherId: t._id, teacherName: t.name, subjectName: r.subject.subjectName })}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, lineHeight: 1, fontSize: '.85rem' }}
                                  title="Unassign teacher"
                                >×</button>
                              </span>
                            ))}
                          </div>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      },
                    ]}
                    data={rows}
                    emptyTitle=""
                  />
                </div>
              ))
          }
        </div>
      </div>

      {/* ── Enrolled Students ─────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Enrolled Students
            <span style={{ marginLeft: 10, fontSize: '.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>
              ({enrolled.length})
            </span>
          </h3>
          <Button onClick={() => { setStudentModal(true); setStudentSearch(''); setStudentResults([]); }}>+ Assign Student</Button>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <Table
            columns={[
              { key: 'name', label: 'Student', render: r => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar avatar-sm" style={{ background: 'var(--success)' }}>{r.name?.[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.email}</div>
                  </div>
                </div>
              )},
              { key: 'rollNumber', label: 'Roll No', render: r => r.rollNumber || '—' },
              { key: 'gender',     label: 'Gender',  render: r => r.gender     || '—' },
              { key: 'admNo',      label: 'Adm. No', render: r => r.admissionNumber || '—' },
              { key: 'actions',    label: '',        render: r => (
                <button className="btn btn-danger btn-sm" onClick={() => setRemoveStudentConfirm(r)}>Remove</button>
              )},
            ]}
            data={enrolled}
            emptyIcon="👨‍🎓"
            emptyTitle="No students enrolled in this section"
          />
        </div>
      </div>

      {/* ── Assign Teacher Modal ─────────────────────────────────────────── */}
      <Modal open={teacherModal} onClose={() => setTeacherModal(false)}
        title={teacherRole === 'class' ? 'Assign Class Teacher' : 'Assign Vice Class Teacher'}
        footer={<>
          <Button variant="secondary" onClick={() => setTeacherModal(false)}>Cancel</Button>
          <Button form="teacher-assign-form" type="submit" loading={savingTeacher}>Save</Button>
        </>}>
        <form id="teacher-assign-form" onSubmit={handleAssignTeacher}>
          <div className="form-group">
            <label className="form-label">Select Teacher</label>
            <select className="form-control" value={selectedTeacher}
              onChange={e => setSelectedTeacher(e.target.value)}>
              <option value="">— None / Remove —</option>
              {teachers.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      {/* ── Unassign Teacher Confirm ─────────────────────────────────────── */}
      <Confirm
        open={!!unassignConfirm}
        onClose={() => setUnassignConfirm(null)}
        onConfirm={handleUnassignTeacher}
        loading={unassigning}
        title="Unassign Teacher"
        message={unassignConfirm
          ? `Are you sure you want to remove ${unassignConfirm.teacherName} from teaching ${unassignConfirm.subjectName} in this section?`
          : ''}
      />

      {/* ── Assign Subject Modal ─────────────────────────────────────────── */}
      <Modal open={subjectModal} onClose={() => setSubjectModal(false)} title="Assign Subject Teacher"
        footer={<>
          <Button variant="secondary" onClick={() => setSubjectModal(false)}>Cancel</Button>
          <Button form="subject-assign-form" type="submit" loading={savingSubject}>Assign</Button>
        </>}>
        <form id="subject-assign-form" onSubmit={handleAssignSubject}>
          <div className="form-group">
            <label className="form-label required">Subject</label>
            <select className="form-control" required value={subjectForm.subject}
              onChange={e => setSubjectForm(f => ({ ...f, subject: e.target.value, teacher: '' }))}>
              <option value="">— Choose subject —</option>
              {(subjects || []).map(s => (
                <option key={s._id} value={s._id}>
                  {s.subjectName}{s.subjectCode ? ` (${s.subjectCode})` : ''} — {TYPE_LABEL[s.type] || s.type}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Teacher</label>
            {subjectForm.subject && subjectTeachers.length === 0
              ? <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 6 }}>
                  No teachers assigned to this subject. Assign teachers from the Subjects page first.
                </p>
              : <select className="form-control" required value={subjectForm.teacher}
                  onChange={e => setSubjectForm(f => ({ ...f, teacher: e.target.value }))}
                  disabled={!subjectForm.subject}>
                  <option value="">— Choose teacher —</option>
                  {subjectTeachers.map(t => (
                    <option key={t._id} value={t._id}>{t.name}</option>
                  ))}
                </select>
            }
          </div>
        </form>
      </Modal>

      {/* ── Assign Student Modal ─────────────────────────────────────────── */}
      <Modal open={studentModal} onClose={() => setStudentModal(false)} title="Assign Student to Section"
        footer={<Button variant="secondary" onClick={() => setStudentModal(false)}>Close</Button>}>
        <div className="form-group" style={{ marginBottom: 8 }}>
          <label className="form-label">Search student by name or email</label>
          <input className="form-control" placeholder="Type to search…" value={studentSearch}
            onChange={e => handleStudentSearch(e.target.value)} autoFocus />
        </div>
        {studentSearching && <div style={{ padding: '8px 0', textAlign: 'center' }}><Spinner size="sm" /></div>}
        {!studentSearching && studentSearch && studentResults.length === 0 && (
          <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>No students found.</p>
        )}
        {studentResults.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {studentResults.map(s => {
              const alreadyEnrolled = enrolled.some(e => e._id === s._id);
              return (
                <div key={s._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{s.name}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{s.email}</div>
                    {s.className && <div style={{ fontSize: '.75rem', color: 'var(--primary)' }}>{s.className}{s.sectionName ? ` – ${s.sectionName}` : ''}</div>}
                  </div>
                  {alreadyEnrolled
                    ? <span style={{ fontSize: '.78rem', color: 'var(--success)' }}>Already enrolled</span>
                    : <button className="btn btn-primary btn-sm" disabled={enrollingId === s._id}
                        onClick={() => handleEnrollStudent(s._id, s.name)}>
                        {enrollingId === s._id ? 'Enrolling…' : 'Enroll'}
                      </button>
                  }
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ── Remove Student Confirm ───────────────────────────────────────── */}
      <Confirm
        open={!!removeStudentConfirm}
        onClose={() => setRemoveStudentConfirm(null)}
        onConfirm={handleRemoveStudent}
        loading={removingStudent}
        title="Remove Student"
        message={removeStudentConfirm ? `Remove ${removeStudentConfirm.name} from this section?` : ''}
      />
    </div>
  );
}
