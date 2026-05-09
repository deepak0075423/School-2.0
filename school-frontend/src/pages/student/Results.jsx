import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getResults, getClassTests } from '../../api/student.api';
import { PageHeader, Table, Badge, Spinner } from '../../components/ui/index';
import { useState } from 'react';

export default function StudentResults() {
  const [tab, setTab] = useState('exams');
  const { data: results,   loading: rl } = useFetch(getResults);
  const { data: classTests,loading: cl } = useFetch(getClassTests);

  const columns = [
    { key: 'exam',     label: 'Exam',    render: r => <strong>{r.exam?.title || r.title}</strong> },
    { key: 'score',    label: 'Score',   render: r => `${r.score ?? '—'} / ${r.maxScore ?? '—'}` },
    { key: 'grade',    label: 'Grade',   render: r => r.grade || '—' },
    { key: 'status',   label: 'Status',  render: r =>
      <Badge variant={r.passed ? 'success' : 'danger'}>{r.passed ? 'Pass' : 'Fail'}</Badge> },
  ];

  return (
    <div className="page">
      <PageHeader title="My Results" subtitle="Exam results and class tests" />
      <div className="tabs">
        {[['exams','Formal Exams'],['class-tests','Class Tests']].map(([k,l]) => (
          <button key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        {tab === 'exams'
          ? (rl ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
              : <Table columns={columns} data={results} emptyIcon="📊" emptyTitle="No results yet" />)
          : (cl ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
              : <Table columns={columns} data={classTests} emptyIcon="📝" emptyTitle="No class tests" />)
        }
      </div></div>
    </div>
  );
}
