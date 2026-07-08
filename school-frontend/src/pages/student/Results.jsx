import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getResults, getClassTests } from '../../api/student.api';
import { PageHeader, Table, Badge, Modal, Button, Spinner } from '../../components/ui/index';

export default function StudentResults() {
  const [tab, setTab] = useState('exams');
  const [detail, setDetail] = useState(null);
  const { data: results,   loading: rl } = useFetch(getResults);
  const { data: classTests,loading: cl } = useFetch(getClassTests);

  const examCols = [
    { key: 'exam',  label: 'Exam',  render: r => <strong>{r.exam?.title || '—'}</strong> },
    { key: 'score', label: 'Score', render: r => `${r.totalMarks ?? '—'} / ${r.totalMaxMarks ?? '—'}` },
    { key: 'pct',   label: '%',     render: r => r.percentage != null ? `${r.percentage}%` : '—' },
    { key: 'grade', label: 'Grade', render: r => r.grade || '—' },
    { key: 'rank',  label: 'Rank',  render: r => r.rank || '—' },
    { key: 'status',label: 'Result',render: r =>
      <Badge variant={r.isPassed ? 'success' : 'danger'}>{r.isPassed ? 'Pass' : 'Fail'}</Badge> },
    { key: 'actions', label: '', render: r => (
      <Button size="sm" variant="secondary" onClick={() => setDetail(r)}>View</Button>
    )},
  ];

  const testCols = [
    { key: 'title',  label: 'Test',    render: r => (
      <div>
        <strong>{r.title}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.subject?.subjectName || r.subject?.name || ''}</div>
      </div>
    )},
    { key: 'date',   label: 'Date',   render: r => r.testDate ? new Date(r.testDate).toLocaleDateString('en-IN') : '—' },
    { key: 'score',  label: 'Score',  render: r => r.myEntry
      ? (r.myEntry.isAbsent ? <Badge variant="muted">Absent</Badge> : `${r.myEntry.marksObtained ?? '—'} / ${r.maxMarks}`)
      : '—' },
    { key: 'grade',  label: 'Grade',  render: r => r.myEntry?.grade || '—' },
    { key: 'status', label: 'Result', render: r => {
      if (!r.myEntry || r.myEntry.isAbsent) return '—';
      const passed = (r.myEntry.marksObtained ?? 0) >= r.passingMarks;
      return <Badge variant={passed ? 'success' : 'danger'}>{passed ? 'Pass' : 'Fail'}</Badge>;
    }},
  ];

  return (
    <div className="page">
      <PageHeader title="My Results" subtitle="Published exam results and class tests" />
      <div className="tabs">
        {[['exams','Formal Exams'],['class-tests','Class Tests']].map(([k,l]) => (
          <button key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        {tab === 'exams'
          ? (rl ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
              : <Table columns={examCols} data={results} emptyIcon="📊" emptyTitle="No published results yet" />)
          : (cl ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
              : <Table columns={testCols} data={classTests} emptyIcon="📝" emptyTitle="No class tests" />)
        }
      </div></div>

      {/* Result detail — subject-wise marks */}
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
