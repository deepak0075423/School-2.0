import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { updateTeacher, toggleTeacher } from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Pagination, Spinner } from '../../components/ui/index';

const EMPTY = { name: '', email: '', phone: '', designation: '' };

function validateCreate(f) {
  if (!f.name.trim())  return 'Full name is required';
  if (!f.email.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return 'Invalid email address';
  if (f.phone && !/^[+\d\s\-]{7,15}$/.test(f.phone)) return 'Invalid phone number';
  return null;
}

export default function Teachers() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [del, setDel]           = useState(null);
  const [delLoading, setDL]     = useState(false);
  const [modal, setModal]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [fieldErr, setFieldErr] = useState({});

  const [editUser, setEditUser]   = useState(null);
  const [editForm, setEditForm]   = useState({ name: '', phone: '', designation: '', password: '' });
  const [editSaving, setEditSave] = useState(false);
  const [editErr, setEditErr]     = useState({});

  const { data, loading, refetch } = useFetch(
    () => api.getTeachers({ page, search, limit: 20 }),
    [page, search],
  );

  // Designation dropdown options (admin-managed)
  const { data: desigData, refetch: refetchDesigs } = useFetch(api.getDesignations);
  const designations = Array.isArray(desigData) ? desigData : [];
  const [desigModal, setDesigModal] = useState(false);
  const [newDesig, setNewDesig]     = useState('');
  const [desigSaving, setDesigSaving] = useState(false);

  const saveDesignations = async (list) => {
    setDesigSaving(true);
    try {
      await api.updateDesignations(list);
      refetchDesigs();
    } catch (err) { toast.error(err.message); }
    finally { setDesigSaving(false); }
  };

  const addDesignation = async (e) => {
    e.preventDefault();
    const name = newDesig.trim();
    if (!name) return;
    if (designations.some(d => d.toLowerCase() === name.toLowerCase()))
      return toast.error('Already exists');
    await saveDesignations([...designations, name]);
    setNewDesig('');
  };

  const removeDesignation = async (name) => {
    if (designations.length <= 1) return toast.error('Keep at least one designation');
    await saveDesignations(designations.filter(d => d !== name));
  };

  const f = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    const err = validateCreate(form);
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      await api.createTeacher(form);
      toast.success('Teacher created');
      setModal(false);
      setForm(EMPTY);
      setFieldErr({});
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteTeacher(del._id); toast.success('Teacher deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const handleEdit = (r) => {
    setEditUser(r);
    setEditForm({ name: r.name || '', phone: r.phone || '', designation: r.designation || '', password: '' });
    setEditErr({});
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim()) { toast.error('Name is required'); return; }
    if (editForm.phone && !/^[+\d\s\-]{7,15}$/.test(editForm.phone)) { toast.error('Invalid phone number'); return; }
    if (editForm.password && editForm.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setEditSave(true);
    try {
      const payload = { name: editForm.name, phone: editForm.phone, designation: editForm.designation };
      if (editForm.password) payload.password = editForm.password;
      await updateTeacher(editUser._id, payload);
      toast.success('Teacher updated');
      setEditUser(null);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setEditSave(false); }
  };

  const handleToggle = async (r) => {
    toast.loading(r.isActive ? 'Deactivating…' : 'Activating…', { id: 'toggle' });
    try {
      await toggleTeacher(r._id);
      toast.success(r.isActive ? 'Teacher deactivated' : 'Teacher activated', { id: 'toggle' });
      refetch();
    } catch (err) { toast.error(err.message, { id: 'toggle' }); }
  };

  const columns = [
    { key: 'name', label: 'Name', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="avatar avatar-sm">{r.name?.[0]}</div>
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{r.email}</div>
        </div>
      </div>
    )},
    { key: 'designation', label: 'Designation', render: r => r.designation || <span style={{ color: 'var(--text-muted)' }}>—</span> },
    { key: 'phone',       label: 'Phone',       render: r => r.phone       || <span style={{ color: 'var(--text-muted)' }}>—</span> },
    { key: 'status', label: 'Status', render: r =>
      <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: 'Actions', render: r => (
      <div className="actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(r)}>Edit</button>
        <button className="btn btn-warning btn-sm" onClick={() => handleToggle(r)}>
          {r.isActive ? 'Deactivate' : 'Activate'}
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Teachers" subtitle={`${data?.total ?? 0} teachers`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setDesigModal(true)}>⚙️ Designations</Button>
            <Button onClick={() => { setForm(EMPTY); setFieldErr({}); setModal(true); }}>+ Add Teacher</Button>
          </div>
        } />

      <div className="card">
        <div className="card-header">
          <input className="form-control" style={{ maxWidth: 280 }} placeholder="🔍 Search teachers…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="👨‍🏫" emptyTitle="No teachers found" />}
        </div>
        {data && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      {/* ── Create Modal ──────────────────────────────────────────────────────── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Add Teacher"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="teacher-form" type="submit" loading={saving}>Create Teacher</Button>
        </>}>
        <form id="teacher-form" onSubmit={handleCreate} noValidate>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label required">Full Name</label>
              <input className="form-control" required placeholder="Ravi Kumar"
                value={form.name} onChange={f('name')} />
            </div>
            <div className="form-group">
              <label className="form-label required">Email Address</label>
              <input type="email" className="form-control" required placeholder="teacher@school.com"
                value={form.email} onChange={f('email')} />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input type="tel" className="form-control" placeholder="+91 98765 43210"
                pattern="[+\d\s\-]{7,15}"
                value={form.phone} onChange={f('phone')} />
            </div>
            <div className="form-group">
              <label className="form-label">Designation</label>
              <select className="form-control" value={form.designation} onChange={f('designation')}>
                <option value="">— Select —</option>
                {designations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
            A one-time password will be emailed to the teacher. They must set a new password on first login.
          </p>
        </form>
      </Modal>

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit Teacher"
        footer={<>
          <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
          <Button form="teacher-edit-form" type="submit" loading={editSaving}>Save Changes</Button>
        </>}>
        <form id="teacher-edit-form" onSubmit={handleUpdate} noValidate>
          <div className="form-group">
            <label className="form-label required">Full Name</label>
            <input className="form-control" required value={editForm.name}
              onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input type="tel" className="form-control" pattern="[+\d\s\-]{7,15}"
                value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Designation</label>
              <select className="form-control" value={editForm.designation}
                onChange={e => setEditForm(p => ({ ...p, designation: e.target.value }))}>
                <option value="">— Select —</option>
                {editForm.designation && !designations.includes(editForm.designation) && (
                  <option value={editForm.designation}>{editForm.designation}</option>
                )}
                {designations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">New Password</label>
              <input type="password" className="form-control" minLength={6} placeholder="Leave blank to keep current"
                value={editForm.password} onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Manage Designations Modal ─────────────────────────────────────────── */}
      <Modal open={desigModal} onClose={() => setDesigModal(false)} title="Manage Designations">
        <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          These options appear in the Designation dropdown when creating or editing a teacher.
          A teacher with the <strong>Librarian</strong> designation can manage the library module.
        </p>
        <form onSubmit={addDesignation} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input className="form-control" placeholder="e.g. Head of Science"
            value={newDesig} onChange={e => setNewDesig(e.target.value)} />
          <Button type="submit" loading={desigSaving}>Add</Button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
          {designations.map(d => (
            <div key={d} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ fontSize: '.9rem' }}>{d}{d === 'Librarian' && <span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--text-muted)' }}>📖 library access</span>}</span>
              <button className="btn btn-danger btn-sm" disabled={desigSaving}
                onClick={() => removeDesignation(d)}>✕</button>
            </div>
          ))}
        </div>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoading} title="Delete Teacher" message={`Delete "${del?.name}"? This cannot be undone.`} />
    </div>
  );
}
