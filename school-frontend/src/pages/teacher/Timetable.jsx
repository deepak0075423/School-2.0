import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getTimetable, downloadTimetable, getClassTimetable } from '../../api/teacher.api';
import { PageHeader, Spinner, Empty } from '../../components/ui/index';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function TeacherTimetable() {
  const [tab,             setTab]             = useState('mine');   // 'mine' | 'myclass'
  const [searchTeacherId, setSearchTeacherId] = useState('');
  const [selectedYearId,  setSelectedYearId]  = useState('');
  const [queryParams,     setQueryParams]      = useState({});
  const [downloading,     setDownloading]      = useState(false);

  const { data: raw,        loading: loading1 } = useFetch(() => getTimetable(queryParams), [queryParams]);
  const { data: classRaw,   loading: loading2 } = useFetch(getClassTimetable, []);

  const payload          = raw || {};
  const entries          = payload.entries          || [];
  const periodsStructure = payload.periodsStructure || [];
  const days             = payload.days             || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const teacher          = payload.teacher;
  const years            = payload.years            || [];
  const selectedYear     = payload.selectedYearId;
  const allTeachers      = payload.allTeachers      || [];

  const classPayload  = classRaw || {};
  const mySection     = classPayload.section;   // null if not a class teacher
  const classTT       = classPayload.timetable;
  const classEntries  = classPayload.entries  || [];
  const classDays     = classPayload.days     || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  useEffect(() => {
    if (selectedYear && !selectedYearId) setSelectedYearId(String(selectedYear));
  }, [selectedYear]);

  const handleSearch = () => {
    const params = {};
    if (searchTeacherId) params.teacherId = searchTeacherId;
    if (selectedYearId && !searchTeacherId) params.yearId = selectedYearId;
    setQueryParams(params);
  };

  const handleYearChange = (yearId) => {
    setSelectedYearId(yearId);
    setQueryParams(prev => ({ ...prev, yearId, teacherId: undefined }));
  };

  const handleMyTimetable = () => {
    setSearchTeacherId('');
    setQueryParams({});
  };

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

  const isViewingSelf = !searchTeacherId;

  if (loading1 || loading2) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader
        title="Timetable"
        subtitle={
          tab === 'myclass' && mySection
            ? `${mySection.className} – Section ${mySection.sectionName} (${mySection.role})`
            : teacher ? `Schedule for: ${teacher.name}` : 'Weekly teaching schedule'
        }
      />

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        <button onClick={() => setTab('mine')} style={{
          padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
          fontWeight: tab === 'mine' ? 700 : 400,
          color: tab === 'mine' ? 'var(--primary)' : 'var(--text-muted)',
          borderBottom: tab === 'mine' ? '2px solid var(--primary)' : '2px solid transparent',
          marginBottom: -2,
        }}>My Schedule</button>

        {mySection && (
          <button onClick={() => setTab('myclass')} style={{
            padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === 'myclass' ? 700 : 400,
            color: tab === 'myclass' ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === 'myclass' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -2,
          }}>
            My Class ({mySection.className} – {mySection.sectionName})
          </button>
        )}
      </div>

      {/* ══ MY SCHEDULE TAB ══════════════════════════════════════════════════ */}
      {tab === 'mine' && (
        <>
          {/* Controls bar */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '.8rem' }}>Search Teacher</label>
                  <select className="form-control" value={searchTeacherId} onChange={e => setSearchTeacherId(e.target.value)}>
                    <option value="">— My Timetable —</option>
                    {allTeachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                </div>

                {!searchTeacherId && years.length > 0 && (
                  <div className="form-group" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '.8rem' }}>Academic Year</label>
                    <select className="form-control" value={selectedYearId} onChange={e => handleYearChange(e.target.value)}>
                      {years.map(y => (
                        <option key={y._id} value={y._id}>
                          {y.yearName}{y.status === 'active' ? ' (Current)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, paddingBottom: 2 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSearch}>View</button>
                  {searchTeacherId && (
                    <button className="btn btn-secondary btn-sm" onClick={handleMyTimetable}>My Timetable</button>
                  )}
                  {isViewingSelf && entries.length > 0 && (
                    <button className="btn btn-secondary btn-sm" disabled={downloading} onClick={handleDownload}>
                      {downloading ? 'Downloading…' : '⬇ Download PDF'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!entries.length
            ? <Empty icon="🕐" title="No timetable assigned" message="No periods have been assigned yet." />
            : <ScheduleGrid entries={entries} periodsStructure={periodsStructure} days={days} />
          }
        </>
      )}

      {/* ══ MY CLASS TAB ═════════════════════════════════════════════════════ */}
      {tab === 'myclass' && mySection && (
        <>
          {!classTT || !classTT.periodsStructure?.length
            ? <Empty icon="🕐" title="Timetable not configured"
                message={`No timetable has been set up for ${mySection.className} – ${mySection.sectionName} yet.`} />
            : (
              <>
                <div style={{ marginBottom: 12, padding: '8px 14px', background: 'var(--bg-secondary)', borderRadius: 8, display: 'inline-block', fontSize: '.85rem', color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>School Timings:</strong>&nbsp;
                  {classTT.schoolStartTime} — {classTT.schoolEndTime}
                </div>
                <ClassTimetableGrid timetable={classTT} entries={classEntries} days={classDays} />
              </>
            )
          }
        </>
      )}
    </div>
  );
}

/* ── Teacher's own schedule grid (shows subject + class/section) ──────────── */
function ScheduleGrid({ entries, periodsStructure, days }) {
  const maxPeriod  = entries.reduce((m, e) => Math.max(m, e.periodNumber || 0), 0);
  const gridPeriods = periodsStructure.length > 0
    ? periodsStructure
    : Array.from({ length: maxPeriod }, (_, i) => ({ periodNumber: i + 1, startTime: '', endTime: '', isRecess: false }));

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
            {gridPeriods.map((p, idx) => (
              <tr key={idx}>
                <td style={{ background: p.isRecess ? 'var(--bg-secondary)' : undefined, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {p.isRecess
                    ? <span style={{ color: '#92400e', fontSize: '.8rem', fontStyle: 'italic' }}>{p.recessName || 'Break'}</span>
                    : <>
                        <strong>P{p.periodNumber}</strong>
                        {p.startTime && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{p.startTime}–{p.endTime}</div>}
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
                            {entry.className && entry.sectionName
                              ? `${entry.className} – ${entry.sectionName}`
                              : entry.className || entry.sectionName || ''}
                          </div>
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

/* ── Full class timetable grid (all subjects + teachers) ──────────────────── */
function ClassTimetableGrid({ timetable, entries, days }) {
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
                <td style={{ background: p.isRecess ? 'var(--bg-secondary)' : undefined, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                  {p.isRecess
                    ? <span style={{ color: '#92400e', fontSize: '.8rem', fontStyle: 'italic' }}>{p.recessName || 'Break'}</span>
                    : <>
                        <strong>P{p.periodNumber}</strong>
                        {p.startTime && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{p.startTime}–{p.endTime}</div>}
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
