import React, { useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getChildAttendance } from '../../api/parent.api';
import { PageHeader, Spinner } from '../../components/ui/index';

const STATUS_COLOR = { present: '#10b981', absent: '#ef4444', late: '#f59e0b', 'half-day': '#6366f1' };

export default function ParentChildAttendance() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year,  setYear]  = useState(today.getFullYear());

  const { data: records, loading } = useFetch(
    () => getChildAttendance({ month, year }),
    [month, year],
  );

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay    = new Date(year, month - 1, 1).getDay();

  const recordMap = {};
  (Array.isArray(records) ? records : []).forEach(r => {
    const d = new Date(r.date).getDate();
    recordMap[d] = r.status;
  });

  const present = Object.values(recordMap).filter(s => s === 'present').length;
  const absent  = Object.values(recordMap).filter(s => s === 'absent').length;
  const total   = Object.keys(recordMap).length;

  return (
    <div className="page">
      <PageHeader title="Child's Attendance" subtitle="Monthly attendance calendar" />
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 140 }} value={month} onChange={e => setMonth(+e.target.value)}>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => (
            <option key={i} value={i+1}>{m}</option>
          ))}
        </select>
        <select className="form-control" style={{ maxWidth: 100 }} value={year} onChange={e => setYear(+e.target.value)}>
          {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600 }}>✅ {present} Present</span>
        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 12px', borderRadius: 99, fontSize: '.85rem', fontWeight: 600 }}>❌ {absent} Absent</span>
        {total > 0 && <span className="text-muted text-sm" style={{ alignSelf: 'center' }}>{Math.round((present/total)*100)}% attendance</span>}
      </div>
      {loading
        ? <div style={{ display:'flex', justifyContent:'center', padding:48 }}><Spinner /></div>
        : (
          <div className="card"><div className="card-body">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:8 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d =>
                <div key={d} style={{ textAlign:'center', fontSize:'.75rem', fontWeight:600, color:'var(--text-muted)', padding:'4px 0' }}>{d}</div>
              )}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
              {Array.from({ length: firstDay }).map((_,i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth },(_,i)=>i+1).map(d => {
                const status = recordMap[d];
                return (
                  <div key={d} style={{
                    textAlign:'center', padding:'8px 4px', borderRadius:8, fontSize:'.85rem',
                    background: status ? STATUS_COLOR[status]+'20' : 'var(--bg)',
                    border:`1px solid ${status ? STATUS_COLOR[status]+'60' : 'var(--border)'}`,
                    color: status ? STATUS_COLOR[status] : 'var(--text)', fontWeight: status ? 600 : 400,
                  }}>
                    {d}
                    {status && <div style={{ fontSize:'.6rem', marginTop:2, textTransform:'capitalize' }}>{status}</div>}
                  </div>
                );
              })}
            </div>
          </div></div>
        )
      }
    </div>
  );
}
