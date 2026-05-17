import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/superAdmin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Pagination, Spinner } from '../../components/ui/index';

const ROLES      = ['super_admin', 'school_admin', 'teacher', 'student', 'parent'];
const BULK_ROLES = ['teacher', 'student'];
const EMPTY_FORM = { name: '', email: '', role: 'teacher', school: '', password: '' }; // password only used on edit

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// ── Sortable column header ────────────────────────────────────────────────────
function SortHeader({ label, field, sort, onSort }) {
  const active = sort.field === field;
  return (
    <button onClick={() => onSort(field)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 4, color: 'inherit', fontSize: 'inherit' }}>
      {label}
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1, opacity: active ? 1 : 0.35 }}>
        <span style={{ fontSize: '.55rem', color: active && sort.dir === 1  ? 'var(--primary)' : 'inherit' }}>▲</span>
        <span style={{ fontSize: '.55rem', color: active && sort.dir === -1 ? 'var(--primary)' : 'inherit' }}>▼</span>
      </span>
    </button>
  );
}

export default function SAUsers() {
  const [page,   setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const [role,   setRole]   = useState('');
  const [school, setSchool] = useState('');
  const [status, setStatus] = useState('');
  const [sort,   setSort]   = useState({ field: 'createdAt', dir: -1 });

  const [selected,      setSelected]      = useState([]);
  const [del,           setDel]           = useState(null);
  const [delLoad,       setDL]            = useState(false);
  const [bulkDel,       setBulkDel]       = useState(false);
  const [bulkDelLoad,   setBDL]           = useState(false);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [editUser,      setEditUser]      = useState(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [saving,        setSaving]        = useState(false);
  const [schools,       setSchools]       = useState([]);
  const [schoolsLoad,   setSchoolsLoad]   = useState(false);
  const [importOpen,    setImportOpen]    = useState(false);
  const [importRole,    setImportRole]    = useState('teacher');
  const [importSchool,  setImportSchool]  = useState('');
  const [importFile,    setImportFile]    = useState(null);
  const [importing,     setImporting]     = useState(false);
  const [linkUser,      setLinkUser]      = useState(null);
  const [generatedLink, setGenLink]       = useState('');
  const [linkLoad,      setLinkLoad]      = useState(false);
  const fileRef = useRef(null);

  const { data, loading, refetch } = useFetch(
    () => api.getUsers({ page, search, role, school, status, limit: 20, sortBy: sort.field, sortDir: sort.dir }),
    [page, search, role, school, status, sort.field, sort.dir],
  );

  const loadSchools = async () => {
    if (schools.length) return;
    setSchoolsLoad(true);
    try {
      const res = await api.getSchools({ limit: 500 });
      setSchools((res?.data?.data || res?.data || []).filter(Boolean));
    } catch { /* ignore */ }
    finally { setSchoolsLoad(false); }
  };

  useEffect(() => { loadSchools(); }, []);

  // ── helpers ──────────────────────────────────────────────────────────────────
  const needsSchool = (r) => ['school_admin', 'teacher', 'student', 'parent'].includes(r);

  const handleSort = (field) => {
    setSort(s => ({ field, dir: s.field === field ? -s.dir : -1 }));
    setPage(1);
  };

  const openCreate = () => { setForm(EMPTY_FORM); setEditUser(null); setCreateOpen(true); };
  const openEdit   = (u) => {
    setForm({ name: u.name, email: u.email, role: u.role, school: u.school?._id || '', password: '' });
    setEditUser(u);
    setCreateOpen(true);
  };
  const openImport = () => { setImportOpen(true); setImportSchool(''); setImportFile(null); };
  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll    = () => {
    const ids = (data?.data || []).map(u => u._id);
    setSelected(s => s.length === ids.length ? [] : ids);
  };

  // ── actions ──────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name is required');
    if (!editUser && !form.email.trim()) return toast.error('Email is required');
    if (needsSchool(form.role) && !form.school) return toast.error('Please select a school');
    setSaving(true);
    try {
      if (editUser) {
        const payload = { name: form.name, role: form.role };
        if (needsSchool(form.role)) payload.school = form.school;
        if (form.password) payload.password = form.password;
        await api.updateUser(editUser._id, payload);
        toast.success('User updated');
      } else {
        const payload = { name: form.name, email: form.email, role: form.role };
        if (needsSchool(form.role) && form.school) payload.school = form.school;
        await api.createUser(payload);
        toast.success('User created — one-time password emailed');
      }
      setCreateOpen(false);
      refetch();
    } catch (err) { toast.error(err.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteUser(del._id); toast.success('User deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const handleBulkDelete = async () => {
    setBDL(true);
    try {
      await api.bulkDeleteUsers(selected);
      toast.success(`${selected.length} users deleted`);
      setSelected([]); setBulkDel(false); refetch();
    } catch (err) { toast.error(err.message); }
    finally { setBDL(false); }
  };

  const handleToggle = async (u) => {
    try { await api.toggleUser(u._id); toast.success('Status updated'); refetch(); }
    catch (err) { toast.error(err.message); }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importFile)   return toast.error('Select a file');
    if (!importSchool) return toast.error('Please select a school');
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('excelFile', importFile);
      fd.append('school', importSchool);
      if (importRole === 'teacher') await api.bulkTeachers(fd);
      else await api.bulkStudents(fd);
      toast.success('Import successful');
      setImportOpen(false); setImportFile(null); setImportSchool('');
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setImporting(false); }
  };

  const handleGenLink = async () => {
    setLinkLoad(true);
    try {
      const res = await api.generateLoginLink(linkUser._id);
      setGenLink(res.data?.link || res.link || '');
    } catch (err) { toast.error(err.message); }
    finally { setLinkLoad(false); }
  };

  // ── columns ──────────────────────────────────────────────────────────────────
  const allIds = (data?.data || []).map(u => u._id);
  const allSel = allIds.length > 0 && allIds.every(id => selected.includes(id));

  const columns = [
    {
      key: '_check',
      label: <input type="checkbox" checked={allSel} onChange={toggleAll} />,
      render: r => (
        <input type="checkbox" checked={selected.includes(r._id)}
          onChange={() => toggleSelect(r._id)} onClick={e => e.stopPropagation()} />
      ),
    },
    {
      key: 'name',
      label: <SortHeader label="Name" field="name" sort={sort} onSort={handleSort} />,
      render: r => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="avatar avatar-sm">{r.name?.[0]}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: <SortHeader label="Role" field="role" sort={sort} onSort={handleSort} />,
      render: r => <Badge variant="info">{(r.role || '').replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'school',
      label: 'School',
      render: r => r.school?.name
        ? <span style={{ fontSize: '.85rem' }}>{r.school.name}</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: r => <Badge variant={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'createdAt',
      label: <SortHeader label="Created" field="createdAt" sort={sort} onSort={handleSort} />,
      render: r => <span style={{ fontSize: '.8rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDate(r.createdAt)}</span>,
    },
    {
      key: 'actions', label: '',
      render: r => (
        <div className="actions" style={{ gap: 4 }}>
          <button className="btn btn-secondary btn-sm" title="Edit" onClick={() => openEdit(r)}>✏️</button>
          <button className="btn btn-secondary btn-sm" title={r.isActive ? 'Deactivate' : 'Activate'}
            onClick={() => handleToggle(r)}>{r.isActive ? '🔒' : '🔓'}
          </button>
          <button className="btn btn-secondary btn-sm" title="One-time login link"
            onClick={() => { setLinkUser(r); setGenLink(''); }}>🔗
          </button>
          <button className="btn btn-danger btn-sm" title="Delete" onClick={() => setDel(r)}>🗑️</button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Users" subtitle={data ? `${data.total} users` : 'All users across all schools'}
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selected.length > 0 && (
              <button className="btn btn-danger btn-sm" onClick={() => setBulkDel(true)}>
                🗑️ Delete {selected.length} selected
              </button>
            )}
            <Button variant="secondary" onClick={openImport}>📥 Bulk Import</Button>
            <Button onClick={openCreate}>+ Add User</Button>
          </div>
        } />

      {/* ── Filters ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <input className="form-control" style={{ flex: '1 1 200px', maxWidth: 260 }}
              placeholder="🔍 Search name or email…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} />
            <select className="form-control" style={{ flex: '0 0 auto', width: 150 }}
              value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
              <option value="">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
            </select>
            <select className="form-control" style={{ flex: '0 0 auto', width: 180 }}
              value={school} onChange={e => { setSchool(e.target.value); setPage(1); }}>
              <option value="">All Schools</option>
              {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            <select className="form-control" style={{ flex: '0 0 auto', width: 140 }}
              value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {(search || role || school || status) && (
              <button className="btn btn-secondary btn-sm"
                onClick={() => { setSearch(''); setRole(''); setSchool(''); setStatus(''); setPage(1); }}>
                ✕ Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="👥" emptyTitle="No users found" />}
        </div>
        {data && (
          <div className="card-footer">
            <Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} />
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)}
        title={editUser ? `Edit — ${editUser.name}` : 'Add User'}
        footer={<>
          <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button form="user-form" type="submit" loading={saving}>{editUser ? 'Update' : 'Create'}</Button>
        </>}>
        <form id="user-form" onSubmit={handleSave}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Full Name</label>
              <input className="form-control" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Email</label>
              <input type="email" className="form-control" required value={form.email}
                disabled={!!editUser} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Role</label>
              <select className="form-control" value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value, school: '' }))}>
                {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            {needsSchool(form.role) && (
              <div className="form-group">
                <label className="form-label required">School</label>
                <select className="form-control" value={form.school}
                  onChange={e => setForm(f => ({ ...f, school: e.target.value }))}>
                  <option value="">{schoolsLoad ? 'Loading…' : '— Select school —'}</option>
                  {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>
            )}
          </div>
          {editUser ? (
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input type="password" className="form-control" placeholder="Leave blank to keep current"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          ) : (
            <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              A one-time password will be emailed to the user. They must set a new password on first login.
            </p>
          )}
        </form>
      </Modal>

      {/* ── Bulk Import Modal ── */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Bulk Import Users"
        footer={<>
          <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
          <Button form="import-form" type="submit" loading={importing}>Import</Button>
        </>}>
        <form id="import-form" onSubmit={handleImport}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Import As</label>
              <select className="form-control" value={importRole} onChange={e => setImportRole(e.target.value)}>
                {BULK_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}s</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">School</label>
              <select className="form-control" value={importSchool} onChange={e => setImportSchool(e.target.value)}>
                <option value="">{schoolsLoad ? 'Loading…' : '— Select school —'}</option>
                {schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label required">Excel File (.xlsx)</label>
            <input ref={fileRef} type="file" className="form-control" accept=".xlsx,.xls"
              onChange={e => setImportFile(e.target.files[0])} />
          </div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 4 }}
            onClick={async () => {
              try {
                const res = importRole === 'teacher' ? await api.downloadTeacherTemplate() : await api.downloadStudentTemplate();
                const url = URL.createObjectURL(new Blob([res]));
                const a = document.createElement('a');
                a.href = url; a.download = `${importRole}_template.xlsx`; a.click();
              } catch { toast.error('Template download failed'); }
            }}>
            📥 Download template
          </button>
        </form>
      </Modal>

      {/* ── Login Link Modal ── */}
      <Modal open={!!linkUser} onClose={() => { setLinkUser(null); setGenLink(''); }}
        title={`Login Link — ${linkUser?.name}`}
        footer={<Button variant="secondary" onClick={() => { setLinkUser(null); setGenLink(''); }}>Close</Button>}>
        <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
          Generate a one-time magic link. The link expires after first use.
        </p>
        {generatedLink ? (
          <div>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', fontFamily: 'monospace', fontSize: '.8rem', wordBreak: 'break-all', marginBottom: 12 }}>
              {generatedLink}
            </div>
            <Button onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success('Copied!'); }}>
              📋 Copy Link
            </Button>
          </div>
        ) : (
          <Button onClick={handleGenLink} loading={linkLoad}>🔗 Generate Link</Button>
        )}
      </Modal>

      {/* ── Confirms ── */}
      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete User" message={`Delete "${del?.name}"? This cannot be undone.`} />
      <Confirm open={bulkDel} onClose={() => setBulkDel(false)} onConfirm={handleBulkDelete}
        loading={bulkDelLoad} title="Delete Selected"
        message={`Delete ${selected.length} selected users? This cannot be undone.`} />
    </div>
  );
}
