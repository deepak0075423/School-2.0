import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getTimetable } from '../../api/student.api';
import { PageHeader, Spinner, Empty } from '../../components/ui/index';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function StudentTimetable() {
  const { data: entries, loading } = useFetch(getTimetable);
  if (loading) return <div className="loading-page"><Spinner /></div>;
  const byDay = {};
  DAYS.forEach(d => { byDay[d] = []; });
  (entries||[]).forEach(e => { if (byDay[e.day]) byDay[e.day].push(e); });
  return (
    <div className="page">
      <PageHeader title="My Timetable" subtitle="Weekly class schedule" />
      {!entries?.length
        ? <Empty icon="🕐" title="Timetable not set" />
        : (
          <div style={{ overflowX:'auto' }}>
            <table className="table" style={{ minWidth:700 }}>
              <thead><tr><th>Period</th>{DAYS.map(d=><th key={d}>{d}</th>)}</tr></thead>
              <tbody>
                {[1,2,3,4,5,6,7,8].map(p => (
                  <tr key={p}><td><strong>P{p}</strong></td>
                    {DAYS.map(day => {
                      const e = byDay[day]?.find(x => x.period === p);
                      return <td key={day}>{e ? (
                        <div style={{ background:'var(--bg)', borderRadius:6, padding:'6px 10px', borderLeft:'3px solid var(--primary)' }}>
                          <div style={{ fontWeight:600, fontSize:'.85rem' }}>{e.subject?.name}</div>
                          <div style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>{e.teacher?.name}</div>
                        </div>
                      ) : <span style={{ color:'var(--border)' }}>—</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}
