import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getResults } from '../../api/parent.api';
import { PageHeader, Table, Badge, Modal, Button, Spinner } from '../../components/ui/index';

export default function ParentResults() {
  const { data: results, loading } = useFetch(getResults);
  const [detail, setDetail] = useState(null);

  const columns = [
    { key: 'exam',  label: 'Exam',  render: r => <strong>{r.exam?.title || '—'}</strong> },
    { key: 'score', label: 'Score', render: r => `${r.totalMarks ?? '—'} / ${r.totalMaxMarks ?? '—'}` },
    { key: 'pct',   label: '%',     render: r => r.percentage != null ? `${r.percentage}%` : '—' },
    { key: 'grade', label: 'Grade', render: r => r.grade ? <Badge variant="info">{r.grade}</Badge> : '—' },
    { key: 'rank',  label: 'Rank',  render: r => r.rank || '—' },
    { key: 'status',label: 'Result',render: r =>
      <Badge variant={r.isPassed ? 'success' : 'danger'}>{r.isPassed ? 'Pass' : 'Fail'}</Badge> },
    { key: 'actions', label: '', render: r => (
      <Button size="sm" variant="secondary" onClick={() => setDetail(r)}>View</Button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Results" subtitle="Your child's published exam results" />
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={results} emptyIcon="📊" emptyTitle="No results published yet" />}
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={640}
        title={detail ? `${detail.exam?.title} — Marksheet` : ''}>
        {detail && (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, fontSize: '.9rem' }}>
              <span>Total: <strong>{detail.totalMarks}/{detail.totalMaxMarks}</strong></span>
              <span>Percentage: <strong>{detail.percentage}%</strong></span>
              <span>Grade: <strong>{detail.grade || '—'}</strong></span>
              {detail.rank ? <span>Rank: <strong>#{detail.rank}</strong></span> : null}
              <Badge variant={detail.isPassed ? 'success' : 'danger'}>{detail.isPassed ? 'Pass' : 'Fail'}</Badge>
            </div>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Subject</th><th>Marks</th><th>Grade</th><th>Result</th></tr></thead>
              <tbody>
                {(detail.subjects || []).map((s, i) => (
                  <tr key={i}>
                    <td>{s.subject?.subjectName || s.subject?.name || '—'}</td>
                    <td>{s.isAbsent ? 'Absent' : `${s.marksObtained}/${s.maxMarks}`}</td>
                    <td>{s.grade || '—'}</td>
                    <td>{s.isAbsent ? '—' : <Badge variant={s.isPassed ? 'success' : 'danger'}>{s.isPassed ? 'Pass' : 'Fail'}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Modal>
    </div>
  );
}
