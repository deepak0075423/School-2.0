import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getDocuments } from '../../api/student.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../components/ui/index';

export default function StudentDocuments() {
  const { data, loading } = useFetch(getDocuments);
  const docs = data?.data || [];

  const handleView = (doc) => {
    if (doc.files?.length) {
      const f = doc.files[0];
      if (f.filePath) {
        window.open(`${import.meta.env.VITE_API_URL || ''}/${f.filePath.replace(/\\/g, '/')}`, '_blank');
      }
    }
  };

  const columns = [
    { key: 'title',    label: 'Title',    render: r => <div><div style={{ fontWeight:600 }}>{r.title}</div>{r.description && <div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.description}</div>}</div> },
    { key: 'category', label: 'Category', render: r => <Badge variant="info">{r.category || 'document'}</Badge> },
    { key: 'dueDate',  label: 'Due',      render: r => r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—' },
    { key: 'files',    label: 'Files',    render: r => r.files?.length ? `${r.files.length} file(s)` : '—' },
    { key: 'actions',  label: '',         render: r => r.files?.length ? (
      <Button size="sm" variant="secondary" onClick={() => handleView(r)}>View</Button>
    ) : null },
  ];

  return (
    <div className="page">
      <PageHeader title="Documents & Notices" subtitle="Files shared with you" />
      <div className="card">
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={docs} emptyIcon="📁" emptyTitle="No documents available" />}
        </div>
      </div>
    </div>
  );
}
