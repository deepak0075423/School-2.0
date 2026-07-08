import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { studentSearch, studentReserve, cancelMyReservation } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Spinner, Pagination } from '../../../components/ui/index';
import { useAuth } from '../../../contexts/AuthContext';

export default function LibrarySearch() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';

  const [query,    setQuery]    = useState('');
  const [category, setCategory] = useState('');
  const [page,     setPage]     = useState(1);

  const { data, loading } = useFetch(
    () => studentSearch({ q: query || undefined, category: category || undefined, page, limit: 20 }),
    [query, category, page],
  );
  const books = Array.isArray(data) ? data : [];

  const handleReserve = async (bookId) => {
    try { await studentReserve(bookId); toast.success('Book reserved!'); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const handleCancel = async (reservationId) => {
    try { await cancelMyReservation(reservationId); toast.success('Reservation cancelled'); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const columns = [
    { key: 'title',    label: 'Title',     render: r => <div><div style={{ fontWeight:600 }}>{r.title}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{(r.authors||[]).join(', ')}</div></div> },
    { key: 'category', label: 'Category',  render: r => r.category ? <Badge variant="info">{r.category}</Badge> : '—' },
    { key: 'copies',   label: 'Available', render: r => r.availableCopies > 0
      ? <Badge variant="success">{r.availableCopies} available</Badge>
      : <Badge variant="warning">On loan</Badge> },
    { key: 'actions',  label: '', render: r => {
      const myRes = r.myReservation;
      if (myRes && (myRes.status === 'pending' || myRes.status === 'ready')) {
        return (
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            <Badge variant={myRes.status === 'ready' ? 'success' : 'warning'}>{myRes.status === 'ready' ? 'Ready to collect' : 'Reserved'}</Badge>
            <button className="btn btn-secondary btn-sm" onClick={() => handleCancel(myRes._id)}>Cancel</button>
          </div>
        );
      }
      return <Button size="sm" variant={r.availableCopies > 0 ? 'primary' : 'secondary'} onClick={() => handleReserve(r._id)}>
        {r.availableCopies > 0 ? 'Reserve' : 'Join Queue'}
      </Button>;
    }},
  ];

  return (
    <div className="page">
      <PageHeader title="Search Books" subtitle="Find books in the library" />
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <input className="form-control" placeholder="Search by title, author, ISBN…" style={{ maxWidth:320 }}
          value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
        <input className="form-control" placeholder="Category…" style={{ maxWidth:160 }}
          value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} />
      </div>
      <div className="card">
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={books} emptyIcon="🔍" emptyTitle={query || category ? 'No books found' : 'Start searching…'} />}
        </div>
        {data?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>
    </div>
  );
}
