import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getTimetable, downloadTimetable } from '../../api/student.api';
import { PageHeader, Spinner, Empty } from '../../components/ui/index';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function StudentTimetable() {
  const { data: raw, loading } = useFetch(getTimetable);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res  = await downloadTimetable();
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      triggerBlobDownload(blob, 'my-timetable.pdf');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to download PDF');
    } finally { setDownloading(false); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const payload    = raw || {};
  const timetable  = payload.timetable;
  const section    = payload.section;
  const entries    = payload.entries    || [];
  const days       = payload.days       || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const activeYear = payload.activeYear;

  return (
    <div className="page">
      <PageHeader
        title="My Timetable"
        subtitle={section ? `${section.className} — Section ${section.sectionName}${activeYear ? ` | ${activeYear.yearName}` : ''}` : 'Weekly class schedule'}
        action={timetable ? (
          <button className="btn btn-primary btn-sm" disabled={downloading} onClick={handleDownload}>
            {downloading ? 'Downloading…' : '⬇ Download PDF'}
          </button>
        ) : null}
      />

      {!timetable || !timetable.periodsStructure?.length
        ? (
          <Empty
            icon="🕐"
            title="Timetable not configured"
            message={section
              ? `No timetable has been set up for ${section.className} – ${section.sectionName} yet. Please contact your admin.`
              : 'No timetable has been assigned yet.'}
          />
        ) : (
          <>
            {/* School timings */}
            <div style={{ marginBottom: 12, padding: '8px 14px', background: 'var(--bg-secondary)', borderRadius: 8, display: 'inline-block', fontSize: '.85rem', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>School Timings:</strong>&nbsp;
              {timetable.schoolStartTime} — {timetable.schoolEndTime}
            </div>

            <TimetableGrid timetable={timetable} entries={entries} days={days} />
          </>
        )
      }
    </div>
  );
}

function TimetableGrid({ timetable, entries, days }) {
  const activeDays = DAYS.filter(d => days.includes(d));

  return (
    <div className="card">
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 600, marginBottom: 0 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 80 }}>Period</th>
              {activeDays.map(d => <th key={d} style={{ minWidth: 110 }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {timetable.periodsStructure.map((p, idx) => (
              <tr key={idx}>
                <td style={{
                  background: p.isRecess ? 'var(--bg-secondary)' : undefined,
                  verticalAlign: 'middle', whiteSpace: 'nowrap',
                }}>
                  {p.isRecess
                    ? <span style={{ color: '#92400e', fontSize: '.8rem', fontStyle: 'italic' }}>{p.recessName || 'Break'}</span>
                    : <>
                        <strong>P{p.periodNumber}</strong>
                        {p.startTime && (
                          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{p.startTime}–{p.endTime}</div>
                        )}
                      </>
                  }
                </td>
                {activeDays.map(day => {
                  if (p.isRecess) return (
                    <td key={day} style={{ background: '#fef9c3', textAlign: 'center', color: '#92400e', fontSize: '.8rem', verticalAlign: 'middle' }}>
                      {p.recessName || 'Break'}
                    </td>
                  );
                  const entry = entries.find(e => e.dayOfWeek === day && e.periodNumber === p.periodNumber);
                  return (
                    <td key={day} style={{ verticalAlign: 'top', padding: '8px 10px' }}>
                      {entry ? (
                        <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '6px 10px', borderLeft: '3px solid var(--primary)' }}>
                          <div style={{ fontWeight: 600, fontSize: '.85rem', color: 'var(--primary)' }}>
                            {entry.subject?.subjectName || entry.subject?.name}
                          </div>
                          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {entry.teacher?.name || <span style={{ color: '#f59e0b' }}>No teacher</span>}
                          </div>
                          {(entry.additionalSubjects || []).filter(a => a.subject).map((a, i) => (
                            <div key={i} style={{ fontSize: '.72rem', marginTop: 3, borderTop: '1px dashed var(--border)', paddingTop: 2 }}>
                              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{a.subject?.subjectName || a.subject?.name}</span>
                              {a.teacher?.name && <span style={{ color: 'var(--text-muted)' }}> · {a.teacher.name}</span>}
                            </div>
                          ))}
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
    </div>
  );
}
