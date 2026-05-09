import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Button, Modal, Confirm, Spinner, Empty } from '../../components/ui/index';

export default function Classes() {
  const [selectedYear, setSelectedYear] = useState('');
  const [modal, setModal]         = useState(false);
  const [del, setDel]             = useState(null);
  const [saving, setSaving]       = useState(false);
  const [delLoad, setDL]          = useState(false);
  const [assignConfirm, setAssignConfirm] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [form, setForm]     = useState({ name: '', level: '' });

  const { data: years } = useFetch(api.getAcademicYears);

  // Auto-select the active academic year once years load
  useEffect(() => {
    if (!years?.length) return;
    const active = years.find(y => y.status === 'active');
    if (active) setSelectedYear(active._id);
  }, [years]);

  const { data: classes, loading, refetch } = useFetch(
    () => api.getClasses(selectedYear ? { academicYear: selectedYear } : {}),
    [selectedYear],
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, level: form.level };
      const yearId = form.academicYear || selectedYear;
      if (yearId) payload.academicYear = yearId;
      await api.createClass(payload);
      toast.success('Class created');
      setModal(false);
      setForm({ name: '', level: '' });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleAutoAssign = async () => {
    setAssigning(true);
    try {
      const res = await api.autoAssignStudents(selectedYear && selectedYear !== 'all' ? selectedYear : undefined);
      const { assigned, skipped = 0, sections } = res.data;
      toast.success(`${assigned} student${assigned !== 1 ? 's' : ''} assigned to ${sections} section${sections !== 1 ? 's' : ''}${skipped ? `, ${skipped} already enrolled (skipped)` : ''}`);
      setAssignConfirm(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setAssigning(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteClass(del._id); toast.success('Class deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Classes" subtitle={`${classes?.length ?? 0} classes`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setAssignConfirm(true)}>Assign Students to Class</Button>
            <Button onClick={() => setModal(true)}>+ Add Class</Button>
          </div>
        } />

      {/* Year filter */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>Academic Year:</label>
            <select className="form-control" style={{ maxWidth: 220 }}
              value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
              <option value="all">All Years</option>
              {(years || []).map(y => (
                <option key={y._id} value={y._id}>
                  {y.yearName}{y.status === 'active' ? ' (Active)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!classes?.length
        ? <Empty icon="🏛️" title="No classes yet" action={<Button onClick={() => setModal(true)}>Create First Class</Button>} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
            {classes.map(cls => (
              <div key={cls._id} className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏛️</div>
                  <h3 style={{ marginBottom: 4 }}>{cls.className}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginBottom: 4 }}>
                    Grade {cls.classNumber}
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '.8rem', marginBottom: 16 }}>
                    {cls.sectionCount ?? 0} section{cls.sectionCount !== 1 ? 's' : ''} · {cls.studentCount ?? 0} students
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <Link to={`/admin/classes/${cls._id}`} className="btn btn-primary btn-sm">View Sections</Link>
                    <button className="btn btn-danger btn-sm" onClick={() => setDel(cls)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      }

      <Modal open={modal} onClose={() => setModal(false)} title="Add Class"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="class-form" type="submit" loading={saving}>Create</Button>
        </>}>
        <form id="class-form" onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label required">Class Name</label>
            <input className="form-control" value={form.name} required
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Class 10" />
          </div>
          <div className="form-group">
            <label className="form-label">Grade / Level</label>
            <input type="number" className="form-control" value={form.level}
              onChange={e => setForm(f => ({ ...f, level: e.target.value }))} placeholder="10" />
          </div>
          {years?.length > 0 && (
            <div className="form-group">
              <label className="form-label">Academic Year</label>
              <select className="form-control" value={form.academicYear || selectedYear}
                onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))}>
                <option value="">Use active year</option>
                {years.map(y => (
                  <option key={y._id} value={y._id}>
                    {y.yearName}{y.status === 'active' ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Class" message={`Delete class "${del?.className}"?`} />

      <Confirm
        open={assignConfirm}
        onClose={() => setAssignConfirm(false)}
        onConfirm={handleAutoAssign}
        loading={assigning}
        title="Assign Students to Classes"
        message="This will enrol all students into their assigned sections for the active academic year, replacing any existing enrolment. Continue?"
      />
    </div>
  );
}
