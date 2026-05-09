import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getMyClass } from '../../api/student.api';
import { PageHeader, Card, Spinner } from '../../components/ui/index';

export default function StudentMyClass() {
  const { data, loading } = useFetch(getMyClass);
  if (loading) return <div className="loading-page"><Spinner /></div>;
  const { section } = data || {};
  return (
    <div className="page">
      <PageHeader title="My Class" subtitle="Current class and section info" />
      {section ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:16 }}>
          <Card title="Class Info">
            {[['Class',section.class?.name],['Section',section.name],['Capacity',section.capacity]].map(([k,v]) => (
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                <span className="text-muted">{k}</span><strong>{v||'—'}</strong>
              </div>
            ))}
          </Card>
          <Card title="Class Teacher">
            {section.classTeacher ? (
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div className="avatar">{section.classTeacher.name?.[0]}</div>
                <div>
                  <div style={{ fontWeight:600 }}>{section.classTeacher.name}</div>
                  <div className="text-muted text-sm">{section.classTeacher.email}</div>
                </div>
              </div>
            ) : <p className="text-muted">No class teacher assigned.</p>}
          </Card>
        </div>
      ) : <div className="alert alert-warning">No class assigned to you yet.</div>}
    </div>
  );
}
