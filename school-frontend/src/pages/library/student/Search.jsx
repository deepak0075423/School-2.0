import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { studentSearch, studentReserve } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Spinner } from '../../../components/ui/index';

export default function LibrarySearch() {
  const [query, setQuery] = useState('');
  const { data: results, loading } = useFetch(
    () => query.trim() ? studentSearch({ q: query }) : Promise.resolve([]),
    [query],
  );

  const handleReserve = async (bookId) => {
    try {
      await studentReserve(bookId);
      toast.success('Book reserved!');
    } catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'title',    label: 'Title',    render: r => <strong>{r.title}</strong> },
    { key: 'author',   label: 'Author',   render: r => r.author || '—' },
    { key: 'category', label: 'Category', render: r => r.category ? <Badge variant="info">{r.category}</Badge> : '—' },
    { key: 'copies',   label: 'Available',render: r => r.availableCopies > 0
      ? <Badge variant="success">{r.availableCopies} available</Badge>
      : <Badge variant="danger">Not available</Badge>
    },
    { key: 'actions',  label: '',         render: r => r.availableCopies === 0 && (
      <Button size="sm" variant="secondary" onClick={() => handleReserve(r._id)}>Reserve</Button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Search Books" subtitle="Find books in the library" />
      <div style={{ marginBottom: 20 }}>
        <input className="form-control" placeholder="Search by title, author, ISBN..." style={{ maxWidth: 360 }}
          value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={results?.books || results} emptyIcon="🔍" emptyTitle={query ? 'No books found' : 'Start searching...'} />}
        </div>
      </div>
    </div>
  );
}
