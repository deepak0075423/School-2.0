import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getDocuments } from '../../api/teacher.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../components/ui/index';

export default function TeacherDocuments() {
  const { data: docs, loading } = useFetch(getDocuments);

  const columns = [
    { key: 'title',     label: 'Title',    render: r => <strong>{r.title}</strong> },
    { key: 'type',      label: 'Type',     render: r => <Badge variant="info">{r.type || 'document'}</Badge> },
    { key: 'createdAt', label: 'Date',     render: r => new Date(r.createdAt).toLocaleDateString() },
    { key: 'actions',   label: '',         render: r => <Button size="sm" variant="secondary">View</Button> },
  ];

  return (
    <div className="page">
      <PageHeader title="Documents" subtitle="Shared files and assignments"
        action={<Button>+ Upload</Button>} />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={docs} emptyIcon="📁" emptyTitle="No documents" />}
        </div>
      </div>
    </div>
  );
}
