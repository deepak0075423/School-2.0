import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Button, Modal, Confirm, Spinner, Badge } from '../../components/ui/index';

const TYPE_LABEL = { theory: 'Theory', practical: 'Practical', elective: 'Elective' };
const TYPE_VARIANT = { theory: 'primary', practical: 'success', elective: 'warning' };

const EMPTY = { name: '', code: '', type: 'theory', teachers: [] };

export default function Subjects() {
  const { data: subjects, loading, refetch } = useFetch(api.getSubjects);
  const [modal, setModal]     = useState(false);
  const [editSub, setEditSub] = useState(null);
  const [del, setDel]         = useState(null);
  const [saving, setSaving]   = useState(false);
  const [delLoad, setDL]      = useState(false);
  const [form, setForm]       = useState(EMPTY);
  const [teachers, setTeachers] = useState([]);
  const [teachLoad, setTL]    = useState(false);

  // Load teachers once for the modal
  useEffect(() => {
    if (!modal) return;
    if (teachers.length) return;
    setTL(true);
    api.getTeachers({ limit: 200 })
      .then(res => setTeachers(res?.data?.data || res?.data || []))
      .catch(() => {})
      .finally(() => setTL(false));
  }, [modal]);

  const openCreate = () => { setForm(EMPTY); setEditSub(null); setModal(true); };
  const openEdit   = (r) => {
    setForm({
      name:     r.subjectName,
      code:     r.subjectCode || '',
      type:     r.type || 'theory',
      teachers: (r.teachers || []).map(t => t._id || t),
    });
    setEditSub(r);
    setModal(true);
  };

  const toggleTeacher = (id) => {
    setForm(f => ({
      ...f,
      teachers: f.teachers.includes(id)
        ? f.teachers.filter(t => t !== id)
        : [...f.teachers, id],
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Subject name is required'); return; }
    setSaving(true);
    try {
      if (editSub) {
        await api.updateSubject(editSub._id, form);
        toast.success('Subject updated');
      } else {
        await api.createSubject(form);
        toast.success('Subject created');
      }
      setModal(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteSubject(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const columns = [
    { key: 'subjectName', label: 'Name', render: r => <strong>{r.subjectName}</strong> },
    { key: 'subjectCode', label: 'Code', render: r => r.subjectCode || '—' },
    { key: 'type',        label: 'Type', render: r => (
      <Badge variant={TYPE_VARIANT[r.type] || 'muted'}>{TYPE_LABEL[r.type] || r.type || '—'}</Badge>
    )},
    { key: 'teachers', label: 'Teachers', render: r => {
      const ts = r.teachers || [];
      if (!ts.length) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ts.map(t => (
            <span key={t._id || t} style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 8px', fontSize: '.78rem',
            }}>{t.name || t}</span>
          ))}
        </div>
      );
    }},
    { key: 'actions', label: '', render: r => (
      <div className="actions">
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
        <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Subjects" subtitle={`${subjects?.length ?? 0} subjects`}
        action={<Button onClick={openCreate}>+ Add Subject</Button>} />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={subjects} emptyIcon="📚" emptyTitle="No subjects yet" />
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editSub ? 'Edit Subject' : 'Add Subject'}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="subject-form" type="submit" loading={saving}>{editSub ? 'Update' : 'Create'}</Button>
        </>}>
        <form id="subject-form" onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label required">Subject Name</label>
              <input className="form-control" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mathematics" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Code</label>
              <input className="form-control" value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="MATH101" />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-control" value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="theory">Theory</option>
                <option value="practical">Practical</option>
                <option value="elective">Elective</option>
              </select>
            </div>
          </div>

          {/* Teachers multi-select */}
          <div className="form-group" style={{ marginTop: 4 }}>
            <label className="form-label">Assign Teachers</label>
            {teachLoad ? (
              <div style={{ padding: '12px 0' }}><Spinner size="sm" /></div>
            ) : teachers.length === 0 ? (
              <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', margin: 0 }}>No teachers found</p>
            ) : (
              <div style={{
                maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '6px 0',
              }}>
                {teachers.map(t => {
                  const checked = form.teachers.includes(t._id);
                  return (
                    <label key={t._id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 14px', cursor: 'pointer',
                      background: checked ? 'var(--primary-light, #eef2ff)' : 'transparent',
                      transition: 'background .1s',
                    }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleTeacher(t._id)}
                        style={{ width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '.87rem' }}>{t.name}</div>
                        <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{t.email}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            {form.teachers.length > 0 && (
              <p style={{ fontSize: '.75rem', color: 'var(--primary)', marginTop: 6 }}>
                {form.teachers.length} teacher{form.teachers.length > 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Subject" message={`Delete "${del?.subjectName}"?`} />
    </div>
  );
}
