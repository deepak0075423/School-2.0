import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/superAdmin.api';
import { PageHeader, Button, Table, Badge, Confirm, Spinner } from '../../components/ui/index';

export default function Schools() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [del, setDel]           = useState(null);
  const [delLoading, setDelLoad]= useState(false);

  const { data, loading, refetch } = useFetch(
    () => api.getSchools({ page, search, limit: 20 }),
    [page, search],
  );

  const handleDelete = async () => {
    setDelLoad(true);
    try {
      await api.deleteSchool(del._id);
      toast.success('School deleted');
      setDel(null);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally { setDelLoad(false); }
  };

  const columns = [
    {
      key: 'logo', label: 'Logo', render: r => (
        <div style={{
          width: 40, height: 40, borderRadius: 6, overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {r.logo
            ? <img src={r.logo} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '1.2rem' }}>🏫</span>}
        </div>
      ),
    },
    {
      key: 'name', label: 'School Name', render: r => (
        <div style={{ fontWeight: 600 }}>{r.name}</div>
      ),
    },
    {
      key: 'code', label: 'Code', render: r => r.code
        ? <span style={{ fontFamily: 'monospace', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4, fontSize: '.8rem', fontWeight: 600 }}>{r.code}</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    { key: 'email',  label: 'Email',  render: r => r.email || '—' },
    { key: 'phone',  label: 'Phone',  render: r => r.phone || '—' },
    {
      key: 'website', label: 'Website', render: r => r.website
        ? <a href={r.website} target="_blank" rel="noreferrer"
            style={{ color: 'var(--primary)', fontSize: '.85rem', maxWidth: 140, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.website.replace(/^https?:\/\//, '')}
          </a>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      key: 'status', label: 'Status', render: r =>
        <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions', label: '', render: r => (
        <div className="actions">
          <Link to={`/super-admin/schools/${r._id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
          <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Schools" subtitle="Manage all registered schools"
        action={<Link to="/super-admin/schools/create" className="btn btn-primary">+ Add School</Link>} />

      <div className="card">
        <div className="card-header">
          <input className="form-control" style={{ maxWidth: 300 }}
            placeholder="🔍 Search schools…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="🏫" emptyTitle="No schools found" />
          }
        </div>
      </div>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoading} title="Delete School"
        message={`Delete "${del?.name}"? This action cannot be undone.`} />
    </div>
  );
}
