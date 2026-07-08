import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getExams } from '../../api/admin.api';
import { PageHeader, Table, Badge, Spinner, Pagination } from '../../components/ui/index';

const STATUS_COLOR = { draft: 'muted', published: 'success', completed: 'info', cancelled: 'danger' };

export default function AdminExams() {
  const [status, setStatus] = useState('');
  const [page, setPage]     = useState(1);
  const { data, loading } = useFetch(() => getExams({ status: status || undefined, page }), [status, page]);

  const exams = Array.isArray(data) ? data : data?.data || data || [];

  const columns = [
    { key: 'title', label: 'Exam', render: r => (
      <div>
        <strong>{r.title}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
          {r.section?.sectionName || ''}{r.subject?.subjectName ? ` · ${r.subject.subjectName}` : ''}
        </div>
      </div>
    )},
    { key: 'creator', label: 'Created by', render: r => r.createdBy?.name || '—' },
    { key: 'date', label: 'Date', render: r => (
      <div>
        {r.examDate ? new Date(r.examDate).toLocaleDateString('en-IN') : '—'}
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.startTime} · {r.duration} min</div>
      </div>
    )},
    { key: 'marks',  label: 'Marks', render: r => r.totalMarks },
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS_COLOR[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'result', label: 'Result', render: r => r.status === 'completed'
      ? <Badge variant={r.resultApprovalStatus === 'approved' ? 'success' : r.resultApprovalStatus === 'rejected' ? 'danger' : 'warning'}>
          {r.resultApprovalStatus || 'pending'}
        </Badge>
      : '—' },
  ];

  return (
    <div className="page">
      <PageHeader title="Aptitude Exams" subtitle="All exams across the school"
        action={
          <select className="form-control" style={{ width: 170 }} value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="completed">Completed</option>
          </select>
        } />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={exams} emptyIcon="📝" emptyTitle="No exams found" />}
        </div>
      </div>
    </div>
  );
}
