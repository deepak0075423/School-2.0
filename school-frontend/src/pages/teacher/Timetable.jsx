import React from 'react';
import useFetch from '../../hooks/useFetch';
import { getTimetable } from '../../api/teacher.api';
import { PageHeader, Spinner, Empty } from '../../components/ui/index';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function TeacherTimetable() {
  const { data: raw, loading } = useFetch(getTimetable);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const entries = raw?.data || [];

  const byDay = {};
  DAYS.forEach(d => { byDay[d] = []; });
  entries.forEach(e => {
    const day = e.dayOfWeek || e.day;
    if (byDay[day]) byDay[day].push(e);
  });

  const maxPeriod = entries.reduce((m, e) => Math.max(m, e.periodNumber || e.period || 0), 8);

  return (
    <div className="page">
      <PageHeader title="My Timetable" subtitle="Weekly teaching schedule" />

      {!entries.length
        ? <Empty icon="🕐" title="No timetable assigned" message="Contact admin to set up your timetable." />
        : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 60 }}>Period</th>
                  {DAYS.map(d => <th key={d}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxPeriod }, (_, i) => i + 1).map(period => (
                  <tr key={period}>
                    <td><strong>P{period}</strong></td>
                    {DAYS.map(day => {
                      const entry = byDay[day]?.find(e => (e.periodNumber || e.period) === period);
                      return (
                        <td key={day}>
                          {entry ? (
                            <div style={{
                              background: 'var(--bg)', borderRadius: 6, padding: '6px 10px',
                              borderLeft: '3px solid var(--primary)',
                            }}>
                              <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{entry.subject?.name}</div>
                              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{entry.section?.name}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--border)', fontSize: '.8rem' }}>—</span>
                          )}
                        </td>
                      );
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
