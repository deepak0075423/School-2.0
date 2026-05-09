import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getDocuments, deleteDocument } from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Confirm, Spinner, Pagination } from '../../components/ui/index';
import toast from 'react-hot-toast';

export default function Documents() {
  const [page, setPage] = useState(1);
  const [del, setDel]   = useState(null);
  const [delLoad, setDL]= useState(false);
  const { data, loading, refetch } = useFetch(() => getDocuments({ page, limit: 20 }), [page]);

  const handleDelete = async () => {
    setDL(true);
    try { await deleteDocument(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const columns = [
    { key: 'title',     label: 'Title',   render: r => <strong>{r.title}</strong> },
    { key: 'type',      label: 'Type',    render: r => <Badge variant="info">{r.type || 'document'}</Badge> },
    { key: 'targetRole',label: 'For',     render: r => r.targetRole || 'All' },
    { key: 'createdAt', label: 'Uploaded',render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'actions',   label: '',        render: r => (
      <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Documents" subtitle="Shared files and assignments"
        action={<Button>+ Upload Document</Button>} />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="📁" emptyTitle="No documents" />}
        </div>
        {data && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Document" message={`Delete "${del?.title}"?`} />
    </div>
  );
}
