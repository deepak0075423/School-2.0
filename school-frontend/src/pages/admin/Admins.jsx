import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Pagination, Spinner } from '../../components/ui/index';

export default function Admins() {
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [del, setDel]       = useState(null);
  const [delLoad, setDL]    = useState(false);
  const [modal, setModal]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState({ name: '', email: '' });

  const { data, loading, refetch } = useFetch(
    () => api.getAdmins({ page, search, limit: 20 }),
    [page, search],
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.createAdmin(form); toast.success('Admin created — login credentials emailed'); setModal(false); setForm({ name: '', email: '' }); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteAdmin(del._id); toast.success('Admin deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const columns = [
    { key: 'name', label: 'Admin', render: r => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="avatar avatar-sm" style={{ background: 'var(--warning)' }}>{r.name?.[0]}</div>
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{r.email}</div>
        </div>
      </div>
    )},
    { key: 'status', label: 'Status', render: r =>
      <Badge variant={r.isActive !== false ? 'success' : 'muted'}>{r.isActive !== false ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: '', render: r => (
      <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Admins" subtitle={`${data?.total ?? 0} admins`}
        action={<Button onClick={() => setModal(true)}>+ Add Admin</Button>} />

      <div className="card">
        <div className="card-header">
          <input className="form-control" style={{ maxWidth: 280 }} placeholder="🔍 Search admins…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="👤" emptyTitle="No admins found" />}
        </div>
        {data && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Admin"
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="admin-form" type="submit" loading={saving}>Create</Button>
        </>}>
        <form id="admin-form" onSubmit={handleCreate}>
          {[
            { name: 'name',  label: 'Full Name', type: 'text',  required: true },
            { name: 'email', label: 'Email',      type: 'email', required: true },
          ].map(f => (
            <div className="form-group" key={f.name}>
              <label className={`form-label${f.required ? ' required' : ''}`}>{f.label}</label>
              <input type={f.type} className="form-control" required={f.required}
                value={form[f.name]} onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))} />
            </div>
          ))}
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            A one-time password will be emailed. The admin must set a new password on first login.
          </p>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Admin" message={`Delete "${del?.name}"?`} />
    </div>
  );
}
