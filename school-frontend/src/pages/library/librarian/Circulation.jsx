import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getIssuances, getReturnForm, issueBook, returnBook, renewBook } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner, Pagination } from '../../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryCirculation() {
  const [statusFilter, setStatusFilter] = useState('issued');
  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useFetch(
    () => getIssuances({ status: statusFilter || undefined, page, limit: 20 }),
    [statusFilter, page],
  );
  const issuances = Array.isArray(data) ? data : [];

  // ── Issue Book ───────────────────────────────────────────────────────────────
  const [issueModal, setIssueModal] = useState(false);
  const [issueForm,  setIssueForm]  = useState({ bookId: '', copyId: '', userId: '', userRole: 'student', dueDate: '', notes: '' });
  const [issueSaving, setIssueSaving] = useState(false);

  const handleIssue = async (e) => {
    e.preventDefault(); setIssueSaving(true);
    try {
      await issueBook(issueForm);
      toast.success('Book issued');
      setIssueModal(false); setIssueForm({ bookId:'', copyId:'', userId:'', userRole:'student', dueDate:'', notes:'' });
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setIssueSaving(false); }
  };

  // ── Return Book ──────────────────────────────────────────────────────────────
  const [returnModal,  setReturnModal]  = useState(false);
  const [returnSearch, setReturnSearch] = useState('');
  const [returnList,   setReturnList]   = useState([]);
  const [returnLoad,   setReturnLoad]   = useState(false);
  const [returning,    setReturning]    = useState(false);

  const searchReturn = async () => {
    if (!returnSearch.trim()) return;
    setReturnLoad(true);
    try {
      const res = await getReturnForm({ userId: returnSearch });
      setReturnList(res?.data?.issuances || []);
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setReturnLoad(false); }
  };

  const handleReturn = async (issuanceId) => {
    setReturning(true);
    try {
      await returnBook({ issuanceId });
      toast.success('Book returned');
      setReturnList(prev => prev.filter(i => i._id !== issuanceId));
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setReturning(false); }
  };

  // ── Renew ────────────────────────────────────────────────────────────────────
  const handleRenew = async (id) => {
    try { await renewBook(id); toast.success('Renewed'); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const statusColor = { issued: 'success', returned: 'muted', overdue: 'danger' };

  const columns = [
    { key: 'book',     label: 'Book',    render: r => <div><div style={{ fontWeight:600 }}>{r.book?.title||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.book?.isbn||''}</div></div> },
    { key: 'member',   label: 'Member',  render: r => <div><div>{r.issuedTo?.name||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.issuedToRole||''}</div></div> },
    { key: 'copy',     label: 'Copy',    render: r => r.bookCopy?.uniqueCode || '—' },
    { key: 'issued',   label: 'Issued',  render: r => fmtDate(r.issueDate) },
    { key: 'due',      label: 'Due',     render: r => {
      const overdue = r.status === 'issued' && new Date() > new Date(r.dueDate);
      return <span style={{ color: overdue ? 'var(--danger)' : 'inherit' }}>{fmtDate(r.dueDate)}</span>;
    }},
    { key: 'status',   label: 'Status',  render: r => <Badge variant={statusColor[r.status]||'muted'}>{r.status}</Badge> },
    { key: 'actions',  label: '', render: r => r.status === 'issued' && (
      <div style={{ display:'flex', gap:4 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => handleRenew(r._id)}>Renew</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Circulation" subtitle="Issue and return books"
        action={
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="secondary" onClick={() => { setReturnList([]); setReturnSearch(''); setReturnModal(true); }}>Return Book</Button>
            <Button onClick={() => setIssueModal(true)}>Issue Book</Button>
          </div>
        } />

      <div className="card">
        <div className="card-header" style={{ display:'flex', gap:8 }}>
          <select className="form-control" style={{ width:160 }} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="issued">Issued</option>
            <option value="returned">Returned</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={issuances} emptyIcon="📖" emptyTitle="No issuances found" />}
        </div>
        {data?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={data.pages} total={data.total} onPage={setPage} /></div>}
      </div>

      {/* Issue Modal */}
      <Modal open={issueModal} onClose={() => setIssueModal(false)} title="Issue Book"
        footer={<><Button variant="secondary" onClick={() => setIssueModal(false)}>Cancel</Button>
          <Button form="issue-form" type="submit" loading={issueSaving}>Issue</Button></>}>
        <form id="issue-form" onSubmit={handleIssue}>
          <div className="form-group"><label className="form-label required">Book ID</label>
            <input className="form-control" required placeholder="MongoDB _id of book"
              value={issueForm.bookId} onChange={e => setIssueForm(f=>({...f,bookId:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label required">Copy ID</label>
            <input className="form-control" required placeholder="MongoDB _id of copy"
              value={issueForm.copyId} onChange={e => setIssueForm(f=>({...f,copyId:e.target.value}))} /></div>
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label required">Member ID</label>
              <input className="form-control" required placeholder="User _id"
                value={issueForm.userId} onChange={e => setIssueForm(f=>({...f,userId:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Role</label>
              <select className="form-control" value={issueForm.userRole}
                onChange={e => setIssueForm(f=>({...f,userRole:e.target.value}))}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select></div>
          </div>
          <div className="form-group"><label className="form-label">Due Date (optional)</label>
            <input type="date" className="form-control" value={issueForm.dueDate}
              onChange={e => setIssueForm(f=>({...f,dueDate:e.target.value}))} /></div>
          <div className="form-group"><label className="form-label">Notes</label>
            <input className="form-control" value={issueForm.notes}
              onChange={e => setIssueForm(f=>({...f,notes:e.target.value}))} /></div>
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal open={returnModal} onClose={() => setReturnModal(false)} title="Return Book"
        footer={<Button variant="secondary" onClick={() => setReturnModal(false)}>Close</Button>}>
        <div style={{ marginBottom:12, display:'flex', gap:8 }}>
          <input className="form-control" placeholder="Enter member User ID…"
            value={returnSearch} onChange={e => setReturnSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchReturn()} />
          <Button onClick={searchReturn} loading={returnLoad}>Search</Button>
        </div>
        {returnList.length > 0 && (
          <table className="table">
            <thead><tr><th>Book</th><th>Due</th><th></th></tr></thead>
            <tbody>
              {returnList.map(i => (
                <tr key={i._id}>
                  <td><strong>{i.book?.title||'—'}</strong><br /><small>{i.bookCopy?.uniqueCode||''}</small></td>
                  <td>{fmtDate(i.dueDate)}</td>
                  <td><Button size="sm" onClick={() => handleReturn(i._id)} loading={returning}>Return</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {returnList.length === 0 && returnSearch && !returnLoad && (
          <p style={{ color:'var(--text-muted)', textAlign:'center', padding:24 }}>No active issuances found.</p>
        )}
      </Modal>
    </div>
  );
}
