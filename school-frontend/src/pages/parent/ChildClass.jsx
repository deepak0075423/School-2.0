import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getChildClass } from '../../api/parent.api';
import { PageHeader, Spinner, Card } from '../../components/ui/index';

export default function ParentChildClass() {
  const { data, loading } = useFetch(getChildClass);

  return (
    <div className="page">
      <PageHeader title="Child's Class" subtitle="Class and teacher details" />
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : data ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 20 }}>
          <Card title="Class Info">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['Student',  data.studentName],
                ['Class',    data.className],
                ['Section',  data.sectionName],
                ['Roll No.', data.rollNumber],
                ['Admission No.', data.admissionNo],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                  <span className="text-muted text-sm">{k}</span>
                  <strong>{v || '—'}</strong>
                </div>
              ))}
            </div>
          </Card>

          {data.classTeacher && (
            <Card title="Class Teacher">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>👩‍🏫</div>
                <div>
                  <strong>{data.classTeacher.name}</strong>
                  <p className="text-muted text-sm" style={{ margin: 0 }}>{data.classTeacher.designation || 'Teacher'}</p>
                </div>
              </div>
              {data.classTeacher.phone && (
                <p className="text-sm text-muted">📞 {data.classTeacher.phone}</p>
              )}
            </Card>
          )}

          {data.subjects?.length > 0 && (
            <Card title="Subjects" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {data.subjects.map(s => (
                  <span key={s._id} style={{ background: '#f1f5f9', borderRadius: 99, padding: '4px 12px', fontSize: '.85rem' }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : (
        <div className="empty-state"><div className="empty-icon">🏛️</div><h3>No class info</h3></div>
      )}
    </div>
  );
}
