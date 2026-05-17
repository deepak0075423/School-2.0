import React, { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getClassesWithSections, getSubjects, getTeachers,
  getSectionTimetable, saveTimetableStructure,
  getSectionEntries, saveTimetableEntries,
  getSectionSubjectTeachers,
} from '../../api/admin.api';
import { PageHeader, Spinner } from '../../components/ui/index';

const DAYS      = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat' };

const defaultPeriods = Array.from({ length: 8 }, (_, i) => ({
  periodNumber: i + 1, startTime: '', endTime: '', isRecess: false, recessName: 'Break',
}));

/* ─── Auto-generate algorithm ─────────────────────────────────────────────────
   Round-robins subjects across day×period slots respecting periodsPerWeek caps.
   Returns a cellData map identical to the component's cellData state.           */
function generateTimetable(subjects, periodsPerWeek, activeDays, periods) {
  const slots = [];
  activeDays.forEach(day => {
    periods.filter(p => !p.isRecess).forEach(p => {
      slots.push({ day, period: p.periodNumber });
    });
  });

  // Build queue: repeat each subject according to its periodsPerWeek count
  const queue = [];
  subjects.forEach(s => {
    const count = periodsPerWeek[s._id] || 0;
    for (let i = 0; i < count; i++) queue.push(s);
  });
  // Shuffle queue so subjects spread naturally
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  const map = {};
  let qi = 0;
  slots.forEach(slot => {
    if (qi >= queue.length) return;
    const subj = queue[qi++];
    const key  = `${slot.day}-${slot.period}`;
    map[key] = {
      subject:     subj._id,
      teacher:     subj.teacher?._id  || '',
      subjectName: subj.name          || subj.subjectName || '',
      teacherName: subj.teacher?.name || '',
    };
  });
  return map;
}

/* ─── Validation ───────────────────────────────────────────────────────────── */
function validateCellData(cellData, periods, activeDays) {
  const errors   = [];
  const warnings = [];

  // Check each active slot
  activeDays.forEach(day => {
    periods.filter(p => !p.isRecess).forEach(p => {
      const key  = `${day}-${p.periodNumber}`;
      const cell = cellData[key];
      if (!cell?.subject) {
        warnings.push(`${DAY_SHORT[day]} P${p.periodNumber} has no subject assigned`);
      } else if (!cell?.teacher) {
        warnings.push(`${DAY_SHORT[day]} P${p.periodNumber} — ${cell.subjectName} has no teacher`);
      }
    });
  });

  // Check teacher double-booking within the same section (same teacher in 2 slots of same day+period is impossible here,
  // but same teacher in two different periods on the same day is fine — only same day+period is a conflict)
  const teacherSlots = {};
  Object.entries(cellData).forEach(([key, cell]) => {
    if (!cell?.teacher) return;
    const existing = teacherSlots[`${cell.teacher}-${key}`];
    if (existing) errors.push(`Teacher conflict: ${cell.teacherName} assigned twice to ${key}`);
    teacherSlots[`${cell.teacher}-${key}`] = true;
  });

  return { errors, warnings };
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function AdminTimetable() {
  const [selectedSection, setSelectedSection] = useState(null);
  const [tab, setTab]           = useState('schedule');
  const [structureForm, setStructureForm] = useState({ schoolStartTime: '', schoolEndTime: '', periods: defaultPeriods });
  const [cellData, setCellData] = useState({});
  const [editingCell, setEditingCell] = useState(null);
  const [cellSubject, setCellSubject] = useState('');
  const [cellTeacher, setCellTeacher] = useState('');
  const [saving, setSaving]           = useState(false);
  const [structureSaving, setStructureSaving] = useState(false);
  const [ttLoading, setTtLoading] = useState(false);

  // Generate modal state
  const [showGenerate, setShowGenerate]     = useState(false);
  const [sectionSubjects, setSectionSubjects] = useState([]);
  const [periodsPerWeek, setPeriodsPerWeek]   = useState({});
  const [activeDays, setActiveDays]           = useState(['Monday','Tuesday','Wednesday','Thursday','Friday']);
  const [generating, setGenerating]           = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Validation state
  const [validationResult, setValidationResult] = useState(null);

  const { data: classesRaw, loading: classesLoading } = useFetch(() => getClassesWithSections(true), []);
  const { data: subjectsRaw } = useFetch(getSubjects, []);
  const { data: teachersRaw } = useFetch(() => getTeachers({ limit: 200 }), []);

  const classes  = classesRaw        || [];
  const subjects = subjectsRaw       || [];
  const teachers = teachersRaw?.data || [];

  /* ── Load section timetable ──────────────────────────────────────────────── */
  const loadSection = useCallback(async (section) => {
    setSelectedSection(section);
    setEditingCell(null);
    setCellData({});
    setValidationResult(null);
    setTtLoading(true);
    try {
      const [ttRes, entriesRes] = await Promise.all([
        getSectionTimetable(section._id),
        getSectionEntries(section._id),
      ]);
      const tt      = ttRes?.data;
      const entries = entriesRes?.data || [];

      if (tt?.periodsStructure?.length) {
        setStructureForm({
          schoolStartTime: tt.schoolStartTime || '',
          schoolEndTime:   tt.schoolEndTime   || '',
          periods: tt.periodsStructure,
        });
      } else {
        setStructureForm({ schoolStartTime: '', schoolEndTime: '', periods: defaultPeriods });
      }

      const map = {};
      entries.forEach(e => {
        const key = `${e.dayOfWeek}-${e.periodNumber}`;
        map[key] = {
          subject: e.subject?._id || '', teacher: e.teacher?._id || '',
          subjectName: e.subject?.name || '', teacherName: e.teacher?.name || '',
        };
      });
      setCellData(map);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally { setTtLoading(false); }
  }, []);

  /* ── Structure save ──────────────────────────────────────────────────────── */
  const handleSaveStructure = async () => {
    const { schoolStartTime, schoolEndTime, periods } = structureForm;

    if (!schoolStartTime) return toast.error('School start time is required');
    if (!schoolEndTime)   return toast.error('School end time is required');
    if (schoolStartTime >= schoolEndTime) return toast.error('Start time must be before end time');

    const teachingPeriods = periods.filter(p => !p.isRecess);
    if (teachingPeriods.length === 0) return toast.error('Add at least one teaching period');

    for (const p of periods) {
      if (!p.startTime) return toast.error(`P${p.periodNumber}: start time is required`);
      if (!p.endTime)   return toast.error(`P${p.periodNumber}: end time is required`);
      if (p.startTime >= p.endTime) return toast.error(`P${p.periodNumber}: start must be before end time`);
    }

    // Check period times don't overlap
    for (let i = 0; i < periods.length - 1; i++) {
      if (periods[i].endTime > periods[i + 1].startTime)
        return toast.error(`Period ${i + 1} and ${i + 2} times overlap`);
    }

    if (!selectedSection) return;
    setStructureSaving(true);
    try {
      await saveTimetableStructure(selectedSection._id, structureForm);
      toast.success('Period structure saved');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setStructureSaving(false); }
  };

  /* ── Cell editing ────────────────────────────────────────────────────────── */
  const openCell = (day, period) => {
    const cur = cellData[`${day}-${period}`] || {};
    setCellSubject(cur.subject || '');
    setCellTeacher(cur.teacher || '');
    setEditingCell({ day, period });
  };

  const saveCell = () => {
    const { day, period } = editingCell;
    const key  = `${day}-${period}`;
    const subj = subjects.find(s => s._id === cellSubject);
    const tchr = teachers.find(t => t._id === cellTeacher);
    if (!cellSubject) {
      const next = { ...cellData };
      delete next[key];
      setCellData(next);
    } else {
      setCellData(prev => ({
        ...prev,
        [key]: {
          subject: cellSubject, teacher: cellTeacher,
          subjectName: subj?.name || '', teacherName: tchr?.name || '',
        },
      }));
    }
    setEditingCell(null);
    setValidationResult(null);
  };

  /* ── Save all ────────────────────────────────────────────────────────────── */
  const handleSaveAll = async () => {
    if (!selectedSection) return;

    // Run validation
    const result = validateCellData(cellData, periods, activeDays);
    if (result.errors.length > 0) {
      setValidationResult(result);
      toast.error(`Fix ${result.errors.length} conflict(s) before saving`);
      return;
    }
    if (result.warnings.length > 0) {
      setValidationResult(result);
      // Warn but still allow save — user must click Save again to confirm
      toast(`${result.warnings.length} warning(s) — review below, then save again to proceed`, { icon: '⚠️' });
      return;
    }

    setSaving(true);
    setValidationResult(null);
    try {
      const entries = [];
      DAYS.forEach(day => {
        periods.filter(p => !p.isRecess).forEach(p => {
          const key  = `${day}-${p.periodNumber}`;
          const cell = cellData[key];
          if (cell?.subject) {
            entries.push({ dayOfWeek: day, periodNumber: p.periodNumber, subject: cell.subject, teacher: cell.teacher || null });
          } else {
            entries.push({ dayOfWeek: day, periodNumber: p.periodNumber, subject: null });
          }
        });
      });
      const res = await saveTimetableEntries(selectedSection._id, entries);
      if (res?.data?.conflicts?.length) {
        toast.error(`Saved with ${res.data.conflicts.length} teacher conflict(s) — check schedule`);
      } else {
        toast.success('Timetable saved successfully');
      }
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  /* ── Force save (ignore warnings) ───────────────────────────────────────── */
  const handleForceSave = async () => {
    setValidationResult(null);
    setSaving(true);
    try {
      const entries = [];
      DAYS.forEach(day => {
        periods.filter(p => !p.isRecess).forEach(p => {
          const key  = `${day}-${p.periodNumber}`;
          const cell = cellData[key];
          if (cell?.subject)
            entries.push({ dayOfWeek: day, periodNumber: p.periodNumber, subject: cell.subject, teacher: cell.teacher || null });
        });
      });
      await saveTimetableEntries(selectedSection._id, entries);
      toast.success('Timetable saved');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  /* ── Open generate modal ────────────────────────────────────────────────── */
  const openGenerateModal = async () => {
    setLoadingSubjects(true);
    setShowGenerate(true);
    try {
      const res = await getSectionSubjectTeachers(selectedSection._id);
      const list = (res?.data || []).map(item => ({
        _id:         item.subject?._id || item.subject,
        name:        item.subject?.name || '',
        teacher:     item.teacher ? { _id: item.teacher._id || item.teacher, name: item.teacher.name || '' } : null,
      }));
      // Deduplicate by subject id
      const seen = new Set();
      const unique = list.filter(s => { if (seen.has(s._id)) return false; seen.add(s._id); return true; });
      setSectionSubjects(unique);
      const defaults = {};
      unique.forEach(s => { defaults[s._id] = periodsPerWeek[s._id] || 1; });
      setPeriodsPerWeek(defaults);
    } catch (err) {
      toast.error('Failed to load section subjects');
      setShowGenerate(false);
    } finally { setLoadingSubjects(false); }
  };

  /* ── Run generate ────────────────────────────────────────────────────────── */
  const handleGenerate = () => {
    if (sectionSubjects.length === 0) return toast.error('No subjects assigned to this section');

    const teachingSlots = activeDays.length * periods.filter(p => !p.isRecess).length;
    const totalPeriods  = Object.values(periodsPerWeek).reduce((s, v) => s + (v || 0), 0);

    if (totalPeriods === 0) return toast.error('Set at least 1 period/week for one subject');
    if (totalPeriods > teachingSlots) {
      return toast.error(`Total periods (${totalPeriods}) exceeds available slots (${teachingSlots}). Reduce periods/week.`);
    }

    setGenerating(true);
    // small timeout so button shows loading state before sync work
    setTimeout(() => {
      const generated = generateTimetable(sectionSubjects, periodsPerWeek, activeDays, periods);
      setCellData(generated);
      setValidationResult(null);
      setShowGenerate(false);
      setGenerating(false);
      toast.success(`Generated ${Object.keys(generated).length} slots — review and save`);
    }, 100);
  };

  const periods = structureForm.periods.length ? structureForm.periods : defaultPeriods;

  if (classesLoading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader
        title="Timetable"
        subtitle={selectedSection ? `${selectedSection.className} — Section ${selectedSection.sectionName}` : 'Select a section to manage timetable'}
      />

      {/* ── Section Selector ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '.85rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>Select Section:</span>
            {classes.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '.85rem', marginTop: 4 }}>
                No classes found — create classes and sections first.
              </span>
            )}
            {classes.map(cls => (
              <div key={cls._id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{cls.className}</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(cls.sections || []).length === 0
                    ? <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>no sections</span>
                    : (cls.sections || []).map(sec => (
                        <button key={sec._id}
                          className={`btn btn-sm ${selectedSection?._id === sec._id ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => loadSection({ ...sec, className: cls.className })}>
                          {sec.sectionName}
                        </button>
                      ))
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!selectedSection && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🕐</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Select a section above to manage its timetable</div>
          <div style={{ fontSize: '.85rem' }}>You can set period structure, assign subjects, or auto-generate a schedule</div>
        </div>
      )}

      {selectedSection && ttLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      )}

      {selectedSection && !ttLoading && (
        <>
          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
            {[['schedule','Schedule'],['structure','Period Structure']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: '8px 20px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontWeight: tab === id ? 700 : 400,
                color: tab === id ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: tab === id ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -2,
              }}>{label}</button>
            ))}
          </div>

          {/* ── Period Structure Tab ─────────────────────────────────────────── */}
          {tab === 'structure' && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Period Structure</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setStructureForm(f => ({
                    ...f,
                    periods: [...f.periods, { periodNumber: f.periods.filter(p => !p.isRecess).length + 1, startTime: '', endTime: '', isRecess: false, recessName: 'Break' }],
                  }))}>+ Add Period</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setStructureForm(f => ({
                    ...f,
                    periods: [...f.periods, { periodNumber: f.periods.length + 1, startTime: '', endTime: '', isRecess: true, recessName: 'Break' }],
                  }))}>+ Add Break</button>
                  <button className="btn btn-primary btn-sm" disabled={structureSaving} onClick={handleSaveStructure}>
                    {structureSaving ? 'Saving…' : 'Save Structure'}
                  </button>
                </div>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 160px' }}>
                    <label className="form-label">School Start Time <span style={{ color: 'red' }}>*</span></label>
                    <input type="time" className="form-control" value={structureForm.schoolStartTime}
                      onChange={e => setStructureForm(f => ({ ...f, schoolStartTime: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ flex: '1 1 160px' }}>
                    <label className="form-label">School End Time <span style={{ color: 'red' }}>*</span></label>
                    <input type="time" className="form-control" value={structureForm.schoolEndTime}
                      onChange={e => setStructureForm(f => ({ ...f, schoolEndTime: e.target.value }))} />
                  </div>
                </div>

                {periods.length === 0
                  ? <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No periods yet — click "+ Add Period"</div>
                  : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="table">
                        <thead>
                          <tr><th style={{ minWidth: 80 }}>#</th><th>Start *</th><th>End *</th><th>Is Break?</th><th>Break Name</th><th style={{ width: 40 }}></th></tr>
                        </thead>
                        <tbody>
                          {periods.map((p, idx) => (
                            <tr key={idx} style={{ background: p.isRecess ? 'var(--bg-secondary)' : undefined }}>
                              <td><strong style={{ color: p.isRecess ? 'var(--text-muted)' : undefined }}>{p.isRecess ? `Break` : `P${p.periodNumber}`}</strong></td>
                              <td>
                                <input type="time" className="form-control" style={{ minWidth: 110 }} value={p.startTime || ''}
                                  onChange={e => setStructureForm(f => { const ps = [...f.periods]; ps[idx] = { ...ps[idx], startTime: e.target.value }; return { ...f, periods: ps }; })} />
                              </td>
                              <td>
                                <input type="time" className="form-control" style={{ minWidth: 110 }} value={p.endTime || ''}
                                  onChange={e => setStructureForm(f => { const ps = [...f.periods]; ps[idx] = { ...ps[idx], endTime: e.target.value }; return { ...f, periods: ps }; })} />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input type="checkbox" checked={!!p.isRecess}
                                  onChange={e => setStructureForm(f => { const ps = [...f.periods]; ps[idx] = { ...ps[idx], isRecess: e.target.checked }; return { ...f, periods: ps }; })} />
                              </td>
                              <td>
                                {p.isRecess && (
                                  <input type="text" className="form-control" style={{ minWidth: 100 }} value={p.recessName || 'Break'}
                                    placeholder="Break name"
                                    onChange={e => setStructureForm(f => { const ps = [...f.periods]; ps[idx] = { ...ps[idx], recessName: e.target.value }; return { ...f, periods: ps }; })} />
                                )}
                              </td>
                              <td>
                                <button className="btn btn-danger btn-sm" onClick={() => setStructureForm(f => {
                                  const ps = f.periods.filter((_, i) => i !== idx);
                                  // Re-number teaching periods
                                  let pn = 0;
                                  const renumbered = ps.map(x => x.isRecess ? x : { ...x, periodNumber: ++pn });
                                  return { ...f, periods: renumbered };
                                })}>×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              </div>
            </div>
          )}

          {/* ── Schedule Tab ─────────────────────────────────────────────────── */}
          {tab === 'schedule' && (
            <>
              {/* Validation panel */}
              {validationResult && (validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
                <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${validationResult.errors.length ? '#ef4444' : '#f59e0b'}` }}>
                  <div className="card-body" style={{ padding: '12px 16px' }}>
                    {validationResult.errors.length > 0 && (
                      <>
                        <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Errors (must fix before saving)</div>
                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: '.85rem', color: '#ef4444' }}>
                          {validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </>
                    )}
                    {validationResult.warnings.length > 0 && (
                      <>
                        <div style={{ fontWeight: 700, color: '#d97706', marginTop: validationResult.errors.length ? 10 : 0, marginBottom: 6 }}>Warnings</div>
                        <ul style={{ margin: 0, paddingLeft: 20, fontSize: '.85rem', color: '#92400e' }}>
                          {validationResult.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                          {validationResult.warnings.length > 5 && <li>…and {validationResult.warnings.length - 5} more</li>}
                        </ul>
                        {validationResult.errors.length === 0 && (
                          <button className="btn btn-warning btn-sm" style={{ marginTop: 10 }} onClick={handleForceSave}>
                            Save Anyway
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>Weekly Schedule</strong>
                    <span style={{ marginLeft: 12, fontSize: '.8rem', color: 'var(--text-muted)' }}>
                      {Object.values(cellData).filter(c => c?.subject).length} / {periods.filter(p => !p.isRecess).length * DAYS.length} slots filled
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setCellData({}); setValidationResult(null); }}>Clear All</button>
                    <button className="btn btn-secondary btn-sm" onClick={openGenerateModal}>⚡ Generate</button>
                    <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleSaveAll}>
                      {saving ? 'Saving…' : 'Save Timetable'}
                    </button>
                  </div>
                </div>
                <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                  <table className="table" style={{ minWidth: 700, marginBottom: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: 90 }}>Period</th>
                        {DAYS.map(d => <th key={d} style={{ minWidth: 120 }}>{DAY_SHORT[d]}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((p, idx) => (
                        <tr key={idx}>
                          <td style={{ whiteSpace: 'nowrap', background: p.isRecess ? 'var(--bg-secondary)' : undefined }}>
                            {p.isRecess
                              ? <span style={{ color: 'var(--text-muted)', fontSize: '.8rem', fontStyle: 'italic' }}>{p.recessName || 'Break'}</span>
                              : <>
                                  <strong>P{p.periodNumber}</strong>
                                  {p.startTime && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{p.startTime}–{p.endTime}</div>}
                                </>
                            }
                          </td>
                          {DAYS.map(day => {
                            if (p.isRecess) return (
                              <td key={day} style={{ background: 'var(--bg-secondary)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.75rem', fontStyle: 'italic' }}>
                                {p.recessName || 'Break'}
                              </td>
                            );

                            const key       = `${day}-${p.periodNumber}`;
                            const cell      = cellData[key];
                            const isEditing = editingCell?.day === day && editingCell?.period === p.periodNumber;

                            return (
                              <td key={day} style={{ padding: 4 }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <select className="form-control" style={{ fontSize: '.8rem', padding: '3px 6px' }}
                                      value={cellSubject} onChange={e => setCellSubject(e.target.value)}>
                                      <option value="">— Subject —</option>
                                      {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                                    </select>
                                    <select className="form-control" style={{ fontSize: '.8rem', padding: '3px 6px' }}
                                      value={cellTeacher} onChange={e => setCellTeacher(e.target.value)}>
                                      <option value="">— Teacher (optional) —</option>
                                      {teachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                                    </select>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: '.75rem', padding: '2px 4px' }} onClick={saveCell}>Save</button>
                                      <button className="btn btn-secondary btn-sm" style={{ fontSize: '.75rem', padding: '2px 8px' }} onClick={() => setEditingCell(null)}>✕</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() => openCell(day, p.periodNumber)}
                                    style={{
                                      cursor: 'pointer', minHeight: 52, borderRadius: 6, padding: '5px 8px',
                                      background: cell?.subject ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                                      border: `1px solid ${cell?.subject ? 'color-mix(in srgb, var(--primary) 35%, transparent)' : 'var(--border)'}`,
                                      transition: 'box-shadow .15s',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = 'var(--shadow)'}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                                  >
                                    {cell?.subject ? (
                                      <>
                                        <div style={{ fontWeight: 600, fontSize: '.82rem', color: 'var(--primary)' }}>{cell.subjectName}</div>
                                        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                          {cell.teacherName || <span style={{ color: '#f59e0b' }}>No teacher</span>}
                                        </div>
                                      </>
                                    ) : (
                                      <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>+ Assign</span>
                                    )}
                                  </div>
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
            </>
          )}
        </>
      )}

      {/* ══ Generate Timetable Modal ══════════════════════════════════════════ */}
      {showGenerate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '1rem' }}>⚡ Auto-Generate Timetable</strong>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowGenerate(false)}>✕</button>
            </div>

            {loadingSubjects
              ? <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div>
              : (
                <div style={{ padding: 20 }}>
                  {sectionSubjects.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      No subjects assigned to this section yet.<br />
                      <small>Go to Classes → Section → assign subject teachers first.</small>
                    </div>
                  )}

                  {/* Working days */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '.9rem' }}>Working Days</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {DAYS.map(d => (
                        <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '.85rem',
                          padding: '4px 10px', borderRadius: 99, border: `1px solid ${activeDays.includes(d) ? 'var(--primary)' : 'var(--border)'}`,
                          background: activeDays.includes(d) ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                          color: activeDays.includes(d) ? 'var(--primary)' : 'var(--text)',
                        }}>
                          <input type="checkbox" style={{ display: 'none' }} checked={activeDays.includes(d)}
                            onChange={e => setActiveDays(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))} />
                          {DAY_SHORT[d]}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Subject periods/week */}
                  {sectionSubjects.length > 0 && (
                    <>
                      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '.9rem' }}>
                        Periods per Week
                        <span style={{ fontWeight: 400, fontSize: '.8rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                          ({Object.values(periodsPerWeek).reduce((s, v) => s + (v || 0), 0)} total /&nbsp;
                          {activeDays.length * periods.filter(p => !p.isRecess).length} available slots)
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                        {sectionSubjects.map(s => (
                          <div key={s._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{s.name}</div>
                              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{s.teacher?.name || 'No teacher assigned'}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button className="btn btn-secondary btn-sm" style={{ width: 28, padding: 0, textAlign: 'center' }}
                                onClick={() => setPeriodsPerWeek(p => ({ ...p, [s._id]: Math.max(0, (p[s._id] || 0) - 1) }))}>−</button>
                              <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{periodsPerWeek[s._id] || 0}</span>
                              <button className="btn btn-secondary btn-sm" style={{ width: 28, padding: 0, textAlign: 'center' }}
                                onClick={() => setPeriodsPerWeek(p => ({ ...p, [s._id]: (p[s._id] || 0) + 1 }))}>+</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => setShowGenerate(false)}>Cancel</button>
                    <button className="btn btn-primary" disabled={generating || sectionSubjects.length === 0} onClick={handleGenerate}>
                      {generating ? 'Generating…' : '⚡ Generate Timetable'}
                    </button>
                  </div>
                </div>
              )
            }
          </div>
        </div>
      )}
    </div>
  );
}
