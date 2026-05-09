import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getIssuances, issueBook, returnBook } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner } from '../../../components/ui/index';

export default function LibraryCirculation() {
  const { data: issuances, loading, refetch } = useFetch(getIssuances);
  const [issueModal,  setIssueModal]  = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [issueForm,   setIssueForm]   = useState({ bookId: '', userId: '', dueDate: '' });
  const [returnForm,  setReturnForm]  = useState({ issuanceId: '' });

  const handleIssue = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await issueBook(issueForm);
      toast.success('Book issued');
      setIssueModal(false);
      setIssueForm({ bookId: '', userId: '', dueDate: '' });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await returnBook(returnForm);
      toast.success('Book returned');
      setReturnModal(false);
      setReturnForm({ issuanceId: '' });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const statusColor = { active: 'success', returned: 'muted', overdue: 'danger' };

  const columns = [
    { key: 'book',      label: 'Book',    render: r => <strong>{r.book?.title || '—'}</strong> },
    { key: 'user',      label: 'Borrower',render: r => r.user?.name || '—' },
    { key: 'issueDate', label: 'Issued',  render: r => r.issueDate ? new Date(r.issueDate).toLocaleDateString() : '—' },
    { key: 'dueDate',   label: 'Due',     render: r => r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—' },
    { key: 'status',    label: 'Status',  render: r => <Badge variant={statusColor[r.status] || 'muted'}>{r.status}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="Circulation" subtitle="Issue and return books"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => setReturnModal(true)}>Return Book</Button>
            <Button onClick={() => setIssueModal(true)}>Issue Book</Button>
          </div>
        } />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={issuances?.issuances || issuances} emptyIcon="📖" emptyTitle="No issuances" />}
        </div>
      </div>

      <Modal open={issueModal} onClose={() => setIssueModal(false)} title="Issue Book"
        footer={<>
          <Button variant="secondary" onClick={() => setIssueModal(false)}>Cancel</Button>
          <Button form="issue-form" type="submit" loading={saving}>Issue</Button>
        </>}>
        <form id="issue-form" onSubmit={handleIssue}>
          <div className="form-group">
            <label className="form-label required">Book ID</label>
            <input className="form-control" required value={issueForm.bookId}
              onChange={e => setIssueForm(f => ({ ...f, bookId: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label required">Member ID (Student/Teacher)</label>
            <input className="form-control" required value={issueForm.userId}
              onChange={e => setIssueForm(f => ({ ...f, userId: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label required">Due Date</label>
            <input type="date" className="form-control" required value={issueForm.dueDate}
              onChange={e => setIssueForm(f => ({ ...f, dueDate: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Modal open={returnModal} onClose={() => setReturnModal(false)} title="Return Book"
        footer={<>
          <Button variant="secondary" onClick={() => setReturnModal(false)}>Cancel</Button>
          <Button form="return-form" type="submit" loading={saving}>Return</Button>
        </>}>
        <form id="return-form" onSubmit={handleReturn}>
          <div className="form-group">
            <label className="form-label required">Issuance ID</label>
            <input className="form-control" required value={returnForm.issuanceId}
              onChange={e => setReturnForm(f => ({ ...f, issuanceId: e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
