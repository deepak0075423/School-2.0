import { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getClassesWithSections, getSubjects, getTeachers,
  getSchoolSettings, getAcademicYears,
  getSectionTimetable, saveTimetableStructure,
  getSectionEntries, saveTimetableEntries,
  getSectionSubjectTeachers, getTimetableTeachers,
  downloadSectionTimetable, downloadAllTimetables,
} from '../../api/admin.api';
import { PageHeader, Spinner } from '../../components/ui/index';

const DAYS      = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat' };
const MAX_EXTRA = 2;

const defaultPeriods = Array.from({ length: 8 }, (_, i) => ({
  periodNumber: i + 1, startTime: '', endTime: '', isRecess: false, recessName: 'Break',
}));

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── Auto-generate algorithm ─────────────────────────────────────────────── */
function generateTimetable(subjects, periodsPerWeek, activeDays, periods) {
  const slots = [];
  activeDays.forEach(day => periods.filter(p => !p.isRecess).forEach(p => slots.push({ day, period: p.periodNumber })));
  const queue = [];
  subjects.forEach(s => { for (let i = 0; i < (periodsPerWeek[s._id] || 0); i++) queue.push(s); });
  for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
  const map = {};
  let qi = 0;
  slots.forEach(slot => {
    if (qi >= queue.length) return;
    const subj = queue[qi++];
    map[`${slot.day}-${slot.period}`] = {
      subject: subj._id, teacher: subj.teacher?._id || '',
      subjectName: subj.subjectName || subj.name || '', teacherName: subj.teacher?.name || '',
      additionalSubjects: [], mergedSections: [],
    };
  });
  return map;
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function AdminTimetable() {
  const [selectedSection,  setSelectedSection]  = useState(null);
  const [tab,              setTab]              = useState('schedule');
  const [ttId,             setTtId]             = useState(null);
  const [ttLoading,        setTtLoading]        = useState(false);
  const [cellData,         setCellData]         = useState({});
  const [saving,           setSaving]           = useState(false);
  const [downloading,      setDownloading]      = useState('');
  const [sameSections,     setSameSections]     = useState([]);
  const [saturdayConfig,   setSaturdayConfig]   = useState({ working: true, halfDay: false, mode: 'all' });

  // Structure form — openOnSaturday comes from school config, not editable here
  const [structureForm,    setStructureForm]    = useState({
    schoolStartTime: '', schoolEndTime: '', periods: defaultPeriods,
  });
  const [autoCalc,         setAutoCalc]         = useState({ totalPeriods: 8, lunchTimeTotalInMinutes: 30, lunchAfterPeriod: 4 });
  const [structureSaving,  setStructureSaving]  = useState(false);

  // Cell edit modal
  const [editModal,        setEditModal]        = useState(null); // { day, period }
  const [modalSubject,     setModalSubject]     = useState('');
  const [modalTeacher,     setModalTeacher]     = useState('');
  const [modalExtra,       setModalExtra]       = useState([]);   // [{subject,teacher}]
  const [modalMerged,      setModalMerged]      = useState([]);
  const [teacherOpts,         setTeacherOpts]         = useState([]);
  const [teacherLoading,      setTeacherLoading]      = useState(false);
  const [extraTeacherOpts,    setExtraTeacherOpts]    = useState([]); // per extra-slot available teachers
  const [extraTeacherLoading, setExtraTeacherLoading] = useState([]); // per extra-slot loading flags

  // Generate modal
  const [showGenerate,     setShowGenerate]     = useState(false);
  const [sectionSubjects,  setSectionSubjects]  = useState([]);
  const [ppw,              setPpw]              = useState({});   // periods per week
  const [genDays,          setGenDays]          = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

  // Keep genDays in sync when saturdayConfig changes
  useEffect(() => {
    setGenDays(prev => {
      const hasSat = prev.includes('Saturday');
      if (saturdayConfig.working && !hasSat) return [...prev, 'Saturday'];
      if (!saturdayConfig.working && hasSat) return prev.filter(d => d !== 'Saturday');
      return prev;
    });
  }, [saturdayConfig.working]);
  const [generating,       setGenerating]       = useState(false);
  const [loadingSubjects,  setLoadingSubjects]  = useState(false);

  const [selectedYearId, setSelectedYearId] = useState('');

  const { data: classesRaw,       loading: classesLoading } = useFetch(() => getClassesWithSections(true), []);
  const { data: subjectsRaw }     = useFetch(getSubjects, []);
  const { data: teachersRaw }     = useFetch(() => getTeachers({ limit: 200 }), []);
  const { data: schoolSettingsRaw } = useFetch(getSchoolSettings, []);
  const { data: yearsRaw }        = useFetch(getAcademicYears, []);

  // Derive saturdayConfig from school settings
  useEffect(() => {
    if (!schoolSettingsRaw?.leaveSettings) return;
    const ls = schoolSettingsRaw.leaveSettings;
    setSaturdayConfig({
      working: ls.saturdayWorking !== false,
      mode:    ls.saturdayMode    || 'all',
      halfDay: !!ls.saturdayHalfDay,
    });
  }, [schoolSettingsRaw]);

  const classes  = classesRaw        || [];
  const subjects = subjectsRaw       || [];
  const teachers = teachersRaw?.data || [];
  const years    = yearsRaw          || [];

  // Default selectedYearId to active year once years are loaded
  useEffect(() => {
    if (years.length && !selectedYearId) {
      const active = years.find(y => y.status === 'active');
      if (active) setSelectedYearId(active._id);
    }
  }, [years]);

  const periods      = structureForm.periods.length ? structureForm.periods : defaultPeriods;
  const displayDays  = DAYS.filter(d => d !== 'Saturday' || saturdayConfig.working);
  const filledSlots  = Object.values(cellData).filter(c => c?.subject).length;
  const totalSlots   = periods.filter(p => !p.isRecess).length * displayDays.length;

  /* ── Load section ──────────────────────────────────────────────────────── */
  const loadSection = useCallback(async (section, allClasses, yearId) => {
    setSelectedSection(section);
    setEditModal(null);
    setCellData({});
    setTtId(null);
    setTtLoading(true);

    const cls  = (allClasses || classes).find(c => c._id === section.classId);
    const peers = (cls?.sections || []).filter(s => s._id !== section._id).map(s => ({
      _id: s._id, sectionName: s.sectionName, className: cls.className,
    }));
    setSameSections(peers);

    const yid = yearId ?? selectedYearId;
    try {
      const [ttRes, entriesRes, subjRes] = await Promise.all([
        getSectionTimetable(section._id, yid),
        getSectionEntries(section._id, yid),
        getSectionSubjectTeachers(section._id).catch(() => ({ data: [] })),
      ]);
      const tt      = ttRes?.data;
      const entries = entriesRes?.data || [];

      const subjSeen = new Set();
      setSectionSubjects((subjRes?.data || [])
        .map(item => ({
          _id: item.subject?._id || item.subject,
          subjectName: item.subject?.subjectName || item.subject?.name || '',
          teacher: item.teacher ? { _id: item.teacher._id, name: item.teacher.name } : null,
        }))
        .filter(s => s._id && !subjSeen.has(s._id) && subjSeen.add(s._id)));

      setStructureForm({
        schoolStartTime: tt?.schoolStartTime || '',
        schoolEndTime:   tt?.schoolEndTime   || '',
        periods:         tt?.periodsStructure?.length ? tt.periodsStructure : defaultPeriods,
      });
      if (tt?.saturdayConfig) setSaturdayConfig(tt.saturdayConfig);
      setTtId(tt?._id || null);

      const map = {};
      entries.forEach(e => {
        map[`${e.dayOfWeek}-${e.periodNumber}`] = {
          subject:            e.subject?._id  || '',
          teacher:            e.teacher?._id  || '',
          subjectName:        e.subject?.subjectName || '',
          teacherName:        e.teacher?.name || '',
          additionalSubjects: (e.additionalSubjects || []).map(a => ({
            subject:     a.subject?._id || '', teacher:     a.teacher?._id || '',
            subjectName: a.subject?.subjectName || '', teacherName: a.teacher?.name || '',
          })),
          mergedSections: (e.mergedSections || []).map(m => m?._id || m || '').filter(Boolean),
        };
      });
      setCellData(map);
    } catch (e) {
      toast.error(e?.response?.data?.message || e.message);
    } finally { setTtLoading(false); }
  }, [classes, selectedYearId]);

  /* ── Auto-calc periods ─────────────────────────────────────────────────── */
  const handleAutoCalc = () => {
    const { schoolStartTime, schoolEndTime } = structureForm;
    if (!schoolStartTime || !schoolEndTime) return toast.error('Set school start and end time first');
    if (schoolStartTime >= schoolEndTime)   return toast.error('Start time must be before end time');

    const parseTime  = t => { const [h, m] = t.split(':'); return parseInt(h) * 60 + parseInt(m); };
    const fmt        = m => `${Math.floor(m / 60).toString().padStart(2, '0')}:${Math.floor(m % 60).toString().padStart(2, '0')}`;
    const lunchMins  = parseInt(autoCalc.lunchTimeTotalInMinutes) || 30;
    const lunchAfter = parseInt(autoCalc.lunchAfterPeriod) || 4;
    const nPeriods   = parseInt(autoCalc.totalPeriods) || 8;
    let   cur        = parseTime(schoolStartTime);
    const endMin     = parseTime(schoolEndTime);
    const avail      = endMin - cur - lunchMins;
    if (avail <= 0) return toast.error('Not enough time for given lunch duration');
    const pLen  = Math.floor(avail / nPeriods);
    const rem   = avail % nPeriods;
    const computed = [];
    let pn = 1;
    for (let i = 1; i <= nPeriods + 1; i++) {
      if (i - 1 === lunchAfter) {
        computed.push({ periodNumber: 0, startTime: fmt(cur), endTime: fmt(cur + lunchMins), isRecess: true, recessName: 'Lunch' });
        cur += lunchMins;
      }
      if (pn <= nPeriods) {
        const dur = pLen + (pn === nPeriods ? rem : 0);
        computed.push({ periodNumber: pn, startTime: fmt(cur), endTime: fmt(cur + dur), isRecess: false });
        cur += dur; pn++;
      }
    }
    setStructureForm(f => ({ ...f, periods: computed }));
    toast.success(`${nPeriods} periods calculated`);
  };

  /* ── Save structure ────────────────────────────────────────────────────── */
  const handleSaveStructure = async () => {
    if (!structureForm.schoolStartTime) return toast.error('School start time required');
    if (!structureForm.schoolEndTime)   return toast.error('School end time required');
    if (structureForm.schoolStartTime >= structureForm.schoolEndTime) return toast.error('Start must be before end');
    if (!periods.filter(p => !p.isRecess).length) return toast.error('Add at least one teaching period');
    setStructureSaving(true);
    try {
      const res = await saveTimetableStructure(selectedSection._id, {
        schoolStartTime:  structureForm.schoolStartTime,
        schoolEndTime:    structureForm.schoolEndTime,
        periods:          structureForm.periods,
        periodsStructure: structureForm.periods,
        yearId:           selectedYearId || undefined,
      });
      setTtId(res?.data?._id || ttId);
      toast.success('Structure saved');
    } catch (e) { toast.error(e?.response?.data?.message || e.message); }
    finally { setStructureSaving(false); }
  };

  /* ── Open cell modal ───────────────────────────────────────────────────── */
  const openCell = async (day, period) => {
    const cur = cellData[`${day}-${period}`] || {};
    const existingExtra = cur.additionalSubjects || [];
    setModalSubject(cur.subject  || '');
    setModalTeacher(cur.teacher  || '');
    setModalExtra(existingExtra);
    setModalMerged(cur.mergedSections    || []);
    setTeacherOpts([]);
    setExtraTeacherOpts(existingExtra.map(() => []));
    setExtraTeacherLoading(existingExtra.map(() => false));
    setEditModal({ day, period });

    if (cur.subject) {
      setTeacherLoading(true);
      try {
        const res = await getTimetableTeachers({ subjectId: cur.subject, day, period, timetableId: ttId, sectionId: selectedSection._id });
        setTeacherOpts(res?.data || []);
      } catch (e) { toast.error(e?.message || 'Failed to load teachers'); setTeacherOpts([]); }
      finally { setTeacherLoading(false); }
    }

    // Fetch teachers for already-assigned extra subjects
    if (existingExtra.length > 0) {
      Promise.all(
        existingExtra.map(es =>
          es.subject
            ? getTimetableTeachers({ subjectId: es.subject, day, period, timetableId: ttId, sectionId: selectedSection._id })
                .then(r => r?.data || []).catch(() => [])
            : Promise.resolve([])
        )
      ).then(results => setExtraTeacherOpts(results));
    }
  };

  const onModalSubjectChange = async (subjectId) => {
    setModalSubject(subjectId);
    setModalTeacher('');
    setTeacherOpts([]);
    if (!subjectId || !editModal) return;
    setTeacherLoading(true);
    try {
      const res = await getTimetableTeachers({ subjectId, day: editModal.day, period: editModal.period, timetableId: ttId, sectionId: selectedSection._id });
      setTeacherOpts(res?.data || []);
    } catch (e) { toast.error(e?.message || 'Failed to load teachers'); setTeacherOpts([]); }
    finally { setTeacherLoading(false); }
  };

  const onExtraSubjectChange = async (idx, subjectId) => {
    if (!subjectId || !editModal) return;
    setExtraTeacherLoading(prev => { const n = [...prev]; n[idx] = true; return n; });
    try {
      const res = await getTimetableTeachers({ subjectId, day: editModal.day, period: editModal.period, timetableId: ttId, sectionId: selectedSection._id });
      setExtraTeacherOpts(prev => { const n = [...prev]; n[idx] = res?.data || []; return n; });
    } catch {
      setExtraTeacherOpts(prev => { const n = [...prev]; n[idx] = []; return n; });
    } finally {
      setExtraTeacherLoading(prev => { const n = [...prev]; n[idx] = false; return n; });
    }
  };

  const saveModal = () => {
    if (!editModal) return;
    const key = `${editModal.day}-${editModal.period}`;
    if (!modalSubject) {
      setCellData(prev => { const next = { ...prev }; delete next[key]; return next; });
      setEditModal(null);
      return;
    }
    const allSubIds = [modalSubject, ...modalExtra.filter(e => e.subject).map(e => e.subject)];
    if (new Set(allSubIds).size !== allSubIds.length)
      return toast.error('Duplicate subjects are not allowed in the same period');
    const subj = sectionSubjects.find(s => s._id === modalSubject);
    const tchr = teacherOpts.find(t => t._id === modalTeacher);
    const resolvedExtra = modalExtra.map((a, originalIdx) => {
      if (!a.subject) return null;
      const eSubj = sectionSubjects.find(s => s._id === a.subject);
      const eTchr = (extraTeacherOpts[originalIdx] || []).find(t => t._id === a.teacher);
      return { subject: a.subject, teacher: a.teacher, subjectName: eSubj?.subjectName || eSubj?.name || '', teacherName: eTchr?.name || '' };
    }).filter(Boolean);
    setCellData(prev => ({
      ...prev,
      [key]: {
        subject: modalSubject, teacher: modalTeacher,
        subjectName: subj?.subjectName || subj?.name || '',
        teacherName: tchr?.name || '',
        additionalSubjects: resolvedExtra,
        mergedSections:     modalMerged.filter(Boolean),
      },
    }));
    setEditModal(null);
  };

  /* ── Save all entries ──────────────────────────────────────────────────── */
  const handleSave = async () => {
    if (!selectedSection) return;
    setSaving(true);
    try {
      const entries = [];
      DAYS.forEach(day => {
        periods.filter(p => !p.isRecess).forEach(p => {
          const cell = cellData[`${day}-${p.periodNumber}`];
          if (cell?.subject) entries.push({
            dayOfWeek: day, periodNumber: p.periodNumber,
            subject: cell.subject, teacher: cell.teacher || null,
            additionalSubjects: (cell.additionalSubjects || []).filter(a => a.subject),
            mergedSections:     (cell.mergedSections     || []).filter(Boolean),
          });
        });
      });
      const res = await saveTimetableEntries(selectedSection._id, { entries, yearId: selectedYearId || undefined });
      if (res?.data?.timetableId && !ttId) setTtId(String(res.data.timetableId));
      if (res?.data?.conflicts?.length) {
        toast.error(`Saved — ${res.data.conflicts.length} teacher conflict(s) detected`);
      } else {
        toast.success('Timetable saved');
      }
    } catch (e) { toast.error(e?.response?.data?.message || e.message); }
    finally { setSaving(false); }
  };

  /* ── Downloads ─────────────────────────────────────────────────────────── */
  const handleDownloadSection = async () => {
    setDownloading('section');
    try {
      const res  = await downloadSectionTimetable(selectedSection._id, selectedYearId || undefined);
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      triggerBlobDownload(blob, `timetable-${selectedSection.className}-${selectedSection.sectionName}.pdf`);
    } catch (e) { toast.error('Download failed'); }
    finally { setDownloading(''); }
  };

  const handleDownloadAll = async () => {
    setDownloading('all');
    try {
      const res  = await downloadAllTimetables(selectedYearId ? { year: selectedYearId } : {});
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      triggerBlobDownload(blob, 'all-timetables.pdf');
    } catch (e) { toast.error('Download failed'); }
    finally { setDownloading(''); }
  };

  /* ── Generate modal ────────────────────────────────────────────────────── */
  const openGenerate = async () => {
    setShowGenerate(true);
    setLoadingSubjects(true);
    try {
      const res  = await getSectionSubjectTeachers(selectedSection._id);
      const seen = new Set();
      const list = (res?.data || [])
        .map(item => ({
          _id: item.subject?._id || item.subject,
          subjectName: item.subject?.subjectName || item.subject?.name || '',
          teacher: item.teacher ? { _id: item.teacher._id, name: item.teacher.name } : null,
        }))
        .filter(s => s._id && !seen.has(s._id) && seen.add(s._id));
      setSectionSubjects(list);
      const def = {};
      list.forEach(s => { def[s._id] = ppw[s._id] || 1; });
      setPpw(def);
    } catch { toast.error('Failed to load subjects'); setShowGenerate(false); }
    finally { setLoadingSubjects(false); }
  };

  const handleGenerate = () => {
    if (!sectionSubjects.length) return toast.error('No subjects assigned to this section');
    const slots = genDays.length * periods.filter(p => !p.isRecess).length;
    const total = Object.values(ppw).reduce((s, v) => s + (v || 0), 0);
    if (!total) return toast.error('Set at least 1 period/week for one subject');
    if (total > slots) return toast.error(`Total periods (${total}) exceeds available slots (${slots})`);
    setGenerating(true);
    setTimeout(() => {
      const generated = generateTimetable(sectionSubjects, ppw, genDays, periods);
      setCellData(generated);
      setShowGenerate(false);
      setGenerating(false);
      toast.success(`${Object.keys(generated).length} slots generated — review and save`);
    }, 80);
  };

  // Reload section data when year changes (if a section is already selected)
  useEffect(() => {
    if (selectedSection && selectedYearId) {
      loadSection(selectedSection, classes, selectedYearId);
    }
  }, [selectedYearId]); // eslint-disable-line

  if (classesLoading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader
        title="Timetable Manager"
        subtitle={(() => {
          const yr = years.find(y => y._id === selectedYearId);
          const yrLabel = yr ? ` [${yr.yearName}]` : '';
          return selectedSection
            ? `${selectedSection.className} — Section ${selectedSection.sectionName}${yrLabel}`
            : `Select a section to manage its timetable${yrLabel}`;
        })()}
        action={selectedSection && !ttLoading ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {ttId && (
              <button className="btn btn-secondary btn-sm" disabled={!!downloading} onClick={handleDownloadSection}>
                {downloading === 'section' ? '…' : '⬇ PDF'}
              </button>
            )}
            <button className="btn btn-secondary btn-sm" disabled={!!downloading} onClick={handleDownloadAll}>
              {downloading === 'all' ? '…' : '⬇ All PDFs'}
            </button>
          </div>
        ) : undefined}
      />

      {/* ── Academic Year Selector ───────────────────────────────────────── */}
      {years.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <label style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            Academic Year:
          </label>
          <select
            className="form-control"
            style={{ width: 'auto', minWidth: 160 }}
            value={selectedYearId}
            onChange={e => setSelectedYearId(e.target.value)}
          >
            {years.map(y => (
              <option key={y._id} value={y._id}>
                {y.yearName}{y.status === 'active' ? ' (Active)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Section Selector ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          {classes.length === 0
            ? <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>No classes found — create classes and sections first.</span>
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {classes.map(cls => (
                  <div key={cls._id}>
                    <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{cls.className}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(cls.sections || []).map(sec => (
                        <button key={sec._id}
                          className={`btn btn-sm ${selectedSection?._id === sec._id ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => loadSection({ ...sec, className: cls.className, classId: cls._id }, classes)}>
                          {sec.sectionName}
                        </button>
                      ))}
                      {!(cls.sections || []).length && <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>no sections</span>}
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Empty state */}
      {!selectedSection && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🕐</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Select a section above</div>
          <div style={{ fontSize: '.85rem' }}>Configure the period structure, then assign subjects to each slot</div>
        </div>
      )}

      {selectedSection && ttLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      )}

      {selectedSection && !ttLoading && (
        <>
          {/* ── Tabs ───────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
            {[['schedule', 'Weekly Schedule'], ['structure', 'Period Structure']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{
                padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: tab === id ? 700 : 400,
                color: tab === id ? 'var(--primary)' : 'var(--text-muted)',
                borderBottom: tab === id ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -2, transition: 'color .15s',
              }}>{label}</button>
            ))}
          </div>

          {/* ══ PERIOD STRUCTURE TAB ═══════════════════════════════════════ */}
          {tab === 'structure' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* School timing + saturday */}
              <div className="card">
                <div className="card-header"><strong>School Timing</strong></div>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
                      <label className="form-label">Start Time</label>
                      <input type="time" className="form-control" value={structureForm.schoolStartTime}
                        onChange={e => setStructureForm(f => ({ ...f, schoolStartTime: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
                      <label className="form-label">End Time</label>
                      <input type="time" className="form-control" value={structureForm.schoolEndTime}
                        onChange={e => setStructureForm(f => ({ ...f, schoolEndTime: e.target.value }))} />
                    </div>

                    {/* Saturday — read-only, driven by School Settings */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
                      <SaturdayBadge config={saturdayConfig} />
                      <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                        From&nbsp;<a href="/admin/settings" style={{ color: 'var(--primary)', textDecoration: 'none' }}>School Settings</a>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Auto-calculate */}
              <div className="card">
                <div className="card-header"><strong>⚡ Auto-Calculate Periods</strong></div>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: '1 1 120px', marginBottom: 0 }}>
                      <label className="form-label">Total Periods</label>
                      <input type="number" className="form-control" min="1" max="20" value={autoCalc.totalPeriods}
                        onChange={e => setAutoCalc(f => ({ ...f, totalPeriods: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                      <label className="form-label">Lunch Duration (min)</label>
                      <input type="number" className="form-control" min="0" value={autoCalc.lunchTimeTotalInMinutes}
                        onChange={e => setAutoCalc(f => ({ ...f, lunchTimeTotalInMinutes: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 150px', marginBottom: 0 }}>
                      <label className="form-label">Lunch After Period #</label>
                      <input type="number" className="form-control" min="1" value={autoCalc.lunchAfterPeriod}
                        onChange={e => setAutoCalc(f => ({ ...f, lunchAfterPeriod: e.target.value }))} />
                    </div>
                    <button className="btn btn-primary" style={{ paddingBottom: '7px' }} onClick={handleAutoCalc}>
                      Calculate
                    </button>
                  </div>
                  <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
                    Period duration is equally distributed. Any leftover minutes are added to the last period.
                  </p>
                </div>
              </div>

              {/* Period list */}
              <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Period List</strong>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setStructureForm(f => ({
                      ...f, periods: [...f.periods, { periodNumber: f.periods.filter(p => !p.isRecess).length + 1, startTime: '', endTime: '', isRecess: false }],
                    }))}>+ Period</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setStructureForm(f => ({
                      ...f, periods: [...f.periods, { periodNumber: 0, startTime: '', endTime: '', isRecess: true, recessName: 'Break' }],
                    }))}>+ Break</button>
                    <button className="btn btn-primary btn-sm" disabled={structureSaving} onClick={handleSaveStructure}>
                      {structureSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  {!periods.length
                    ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No periods yet — use auto-calculate or click "+ Period"</div>
                    : (
                      <table className="table" style={{ marginBottom: 0 }}>
                        <thead>
                          <tr>
                            <th style={{ width: 70 }}>#</th>
                            <th>Start</th><th>End</th>
                            <th style={{ width: 80, textAlign: 'center' }}>Break?</th>
                            <th>Break Name</th>
                            <th style={{ width: 40 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {periods.map((p, idx) => (
                            <tr key={idx} style={{ background: p.isRecess ? 'var(--bg-secondary)' : undefined }}>
                              <td><strong style={{ color: p.isRecess ? 'var(--text-muted)' : 'var(--primary)' }}>{p.isRecess ? '—' : `P${p.periodNumber}`}</strong></td>
                              <td>
                                <input type="time" className="form-control" value={p.startTime || ''}
                                  onChange={e => setStructureForm(f => { const ps = [...f.periods]; ps[idx] = { ...ps[idx], startTime: e.target.value }; return { ...f, periods: ps }; })} />
                              </td>
                              <td>
                                <input type="time" className="form-control" value={p.endTime || ''}
                                  onChange={e => setStructureForm(f => { const ps = [...f.periods]; ps[idx] = { ...ps[idx], endTime: e.target.value }; return { ...f, periods: ps }; })} />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <input type="checkbox" checked={!!p.isRecess}
                                  onChange={e => setStructureForm(f => { const ps = [...f.periods]; ps[idx] = { ...ps[idx], isRecess: e.target.checked }; return { ...f, periods: ps }; })} />
                              </td>
                              <td>
                                {p.isRecess
                                  ? <input type="text" className="form-control" value={p.recessName || 'Break'}
                                      onChange={e => setStructureForm(f => { const ps = [...f.periods]; ps[idx] = { ...ps[idx], recessName: e.target.value }; return { ...f, periods: ps }; })} />
                                  : <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>—</span>
                                }
                              </td>
                              <td>
                                <button className="btn btn-danger btn-sm" onClick={() => setStructureForm(f => {
                                  const ps = f.periods.filter((_, i) => i !== idx);
                                  let pn = 0;
                                  return { ...f, periods: ps.map(x => x.isRecess ? x : { ...x, periodNumber: ++pn }) };
                                })}>×</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  }
                </div>
              </div>
            </div>
          )}

          {/* ══ SCHEDULE TAB ════════════════════════════════════════════════ */}
          {tab === 'schedule' && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <strong>Weekly Schedule</strong>
                  <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 99 }}>
                    {filledSlots} / {totalSlots} filled
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setCellData({})}>Clear</button>
                  <button className="btn btn-secondary btn-sm" onClick={openGenerate}>⚡ Generate</button>
                  <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleSave}>
                    {saving ? 'Saving…' : 'Save Timetable'}
                  </button>
                </div>
              </div>

              <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th style={thStyle('#', true)}>Period</th>
                      {displayDays.map(d => <th key={d} style={thStyle(d)}>{DAY_SHORT[d]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p, idx) => (
                      <tr key={idx}>
                        {/* Period label cell */}
                        <td style={{
                          ...tdBase,
                          background: p.isRecess ? 'var(--bg-secondary)' : 'var(--bg)',
                          width: 88, whiteSpace: 'nowrap',
                        }}>
                          {p.isRecess
                            ? <span style={{ fontSize: '.78rem', color: '#92400e', fontStyle: 'italic' }}>{p.recessName || 'Break'}</span>
                            : <>
                                <div style={{ fontWeight: 700, fontSize: '.85rem' }}>P{p.periodNumber}</div>
                                {p.startTime && <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{p.startTime}–{p.endTime}</div>}
                              </>
                          }
                        </td>

                        {displayDays.map(day => {
                          if (p.isRecess) return (
                            <td key={day} style={{ ...tdBase, background: '#fef9c3', textAlign: 'center', color: '#92400e', fontSize: '.78rem', fontStyle: 'italic' }}>
                              {p.recessName || 'Break'}
                            </td>
                          );

                          const key  = `${day}-${p.periodNumber}`;
                          const cell = cellData[key];
                          return (
                            <td key={day} style={{ ...tdBase, padding: 6, verticalAlign: 'top', cursor: 'pointer' }}
                              onClick={() => openCell(day, p.periodNumber)}>
                              <GridCell cell={cell} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══ CELL EDIT MODAL ═══════════════════════════════════════════════ */}
      {editModal && (
        <CellModal
          day={editModal.day} period={editModal.period}
          subjects={sectionSubjects}
          teachers={teacherOpts}
          allTeachers={[]}
          teacherLoading={teacherLoading}
          subject={modalSubject} teacher={modalTeacher}
          extraSubs={modalExtra} merged={modalMerged}
          sameSections={sameSections}
          extraTeacherOpts={extraTeacherOpts}
          extraTeacherLoading={extraTeacherLoading}
          onSubjectChange={onModalSubjectChange}
          onTeacherChange={setModalTeacher}
          onExtraChange={setModalExtra}
          onExtraSubjectChange={onExtraSubjectChange}
          onMergedChange={setModalMerged}
          onSave={saveModal}
          onClose={() => setEditModal(null)}
          onClear={() => {
            const key = `${editModal.day}-${editModal.period}`;
            setCellData(prev => { const n = { ...prev }; delete n[key]; return n; });
            setEditModal(null);
          }}
        />
      )}

      {/* ══ GENERATE MODAL ════════════════════════════════════════════════ */}
      {showGenerate && (
        <GenerateModal
          subjects={sectionSubjects} loading={loadingSubjects}
          ppw={ppw} setPpw={setPpw}
          days={DAYS} genDays={genDays} setGenDays={setGenDays}
          DAY_SHORT={DAY_SHORT}
          availableSlots={genDays.length * periods.filter(p => !p.isRecess).length}
          generating={generating}
          onGenerate={handleGenerate}
          onClose={() => setShowGenerate(false)}
        />
      )}
    </div>
  );
}

/* ── Grid cell display ─────────────────────────────────────────────────────── */
const thStyle = (_, first) => ({
  padding: '10px 12px', textAlign: 'center', fontSize: '.78rem', fontWeight: 700,
  background: 'var(--bg-secondary)', color: 'var(--text-muted)',
  border: '1px solid var(--border)', letterSpacing: .5,
  ...(first ? { width: 88 } : {}),
});
const tdBase = { border: '1px solid var(--border)', padding: '8px 10px', verticalAlign: 'middle', minWidth: 100 };

function GridCell({ cell }) {
  const empty   = !cell?.subject;
  const extras  = (cell?.additionalSubjects || []).filter(a => a.subject);
  return (
    <div style={{
      minHeight: 56, borderRadius: 6, padding: '6px 8px',
      background: empty ? 'transparent' : 'color-mix(in srgb, var(--primary) 10%, transparent)',
      border: `1px solid ${empty ? 'var(--border)' : 'color-mix(in srgb, var(--primary) 30%, transparent)'}`,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      transition: 'background .15s, box-shadow .15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      {empty
        ? <span style={{ fontSize: '.72rem', color: 'var(--border)' }}>+ Assign</span>
        : <>
            <div style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--primary)', lineHeight: 1.2 }}>{cell.subjectName}</div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
              {cell.teacherName || <span style={{ color: '#f59e0b' }}>No teacher</span>}
            </div>
            {extras.map((a, i) => (
              <div key={i} style={{ fontSize: '.68rem', marginTop: 3, borderTop: '1px dashed var(--border)', paddingTop: 2 }}>
                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{a.subjectName}</span>
                {a.teacherName
                  ? <span style={{ color: 'var(--text-muted)' }}> · {a.teacherName}</span>
                  : <span style={{ color: '#f59e0b' }}> · No teacher</span>}
              </div>
            ))}
            {(cell.mergedSections || []).length > 0 && (
              <div style={{ fontSize: '.65rem', color: 'var(--primary)', marginTop: 1 }}>🔗 merged</div>
            )}
          </>
      }
    </div>
  );
}

/* ── Cell edit modal ───────────────────────────────────────────────────────── */
function CellModal({
  day, period, subjects, teachers, allTeachers, teacherLoading,
  subject, teacher, extraSubs, merged, sameSections,
  extraTeacherOpts, extraTeacherLoading,
  onSubjectChange, onTeacherChange, onExtraChange, onExtraSubjectChange, onMergedChange,
  onSave, onClose, onClear,
}) {
  const usedIds  = new Set([subject, ...extraSubs.map(e => e.subject)].filter(Boolean));

  const addExtra = () => {
    if (extraSubs.length >= MAX_EXTRA) return;
    onExtraChange([...extraSubs, { subject: '', teacher: '', subjectName: '', teacherName: '' }]);
  };
  const updateExtra = (idx, field, val) => {
    onExtraChange(extraSubs.map((es, i) => i === idx ? { ...es, [field]: val } : es));
  };
  const handleExtraSubjectChange = (idx, subjectId) => {
    onExtraChange(extraSubs.map((es, i) => i === idx ? { ...es, subject: subjectId, teacher: '' } : es));
    if (onExtraSubjectChange) onExtraSubjectChange(idx, subjectId);
  };
  const removeExtra = (idx) => onExtraChange(extraSubs.filter((_, i) => i !== idx));

  const toggleMerge = (id) => {
    onMergedChange(merged.includes(id) ? merged.filter(x => x !== id) : [...merged, id]);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ fontSize: '.95rem' }}>{day} — Period {period}</strong>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Assign subject and teacher</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Primary subject */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Subject</label>
            {subjects.length === 0
              ? <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', padding: '8px 12px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  No subjects assigned to this section. Assign subjects first via <em>Section Subject Teachers</em>.
                </div>
              : <select className="form-control" value={subject} onChange={e => onSubjectChange(e.target.value)}>
                  <option value="">— Select Subject —</option>
                  {subjects.map(s => <option key={s._id} value={s._id}>{s.subjectName || s.name}</option>)}
                </select>
            }
          </div>

          {/* Primary teacher */}
          {subject && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Teacher</label>
              <select className="form-control" value={teacher} onChange={e => onTeacherChange(e.target.value)} disabled={teacherLoading}>
                <option value="">{teacherLoading ? 'Loading available teachers…' : teachers.length === 0 ? '— No available teachers for this slot —' : '— Select Teacher (optional) —'}</option>
                {teachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* Additional subjects */}
          {extraSubs.length > 0 && (
            <div>
              <label className="form-label">Additional Subjects</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {extraSubs.map((es, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', position: 'relative' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <select className="form-control" value={es.subject} onChange={e => handleExtraSubjectChange(idx, e.target.value)}>
                        <option value="">— Extra Subject —</option>
                        {subjects.filter(s => !usedIds.has(s._id) || s._id === es.subject)
                          .map(s => <option key={s._id} value={s._id}>{s.subjectName || s.name}</option>)}
                      </select>
                      <select className="form-control" value={es.teacher} onChange={e => updateExtra(idx, 'teacher', e.target.value)} disabled={!!extraTeacherLoading?.[idx]}>
                        <option value="">{extraTeacherLoading?.[idx] ? 'Loading available teachers…' : '— Teacher (optional) —'}</option>
                        {(extraTeacherOpts?.[idx] || allTeachers).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                      </select>
                    </div>
                    <button onClick={() => removeExtra(idx)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 4px', flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add extra button */}
          {subject && extraSubs.length < MAX_EXTRA && (
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addExtra}>
              + Add Extra Subject
            </button>
          )}

          {/* Merged sections */}
          {sameSections.length > 0 && (
            <div>
              <label className="form-label">Merge Sections <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '.8rem' }}>(students attend together)</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {sameSections.map(sec => (
                  <label key={sec._id} style={{
                    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                    padding: '5px 10px', borderRadius: 99, fontSize: '.82rem',
                    border: `1px solid ${merged.includes(sec._id) ? 'var(--primary)' : 'var(--border)'}`,
                    background: merged.includes(sec._id) ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                    color: merged.includes(sec._id) ? 'var(--primary)' : 'var(--text)',
                  }}>
                    <input type="checkbox" style={{ display: 'none' }} checked={merged.includes(sec._id)} onChange={() => toggleMerge(sec._id)} />
                    🔗 {sec.className} - {sec.sectionName}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-danger btn-sm" onClick={onClear}>Clear Slot</button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* ── Generate modal ──────────────────────────────────────────────────────── */
function GenerateModal({ subjects, loading, ppw, setPpw, days, genDays, setGenDays, DAY_SHORT, availableSlots, generating, onGenerate, onClose }) {
  const totalPeriods = Object.values(ppw).reduce((s, v) => s + (v || 0), 0);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>⚡ Auto-Generate Timetable</strong>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading ? <div style={{ padding: 48, textAlign: 'center' }}><Spinner /></div> : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!subjects.length && (
              <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, color: 'var(--text-muted)', textAlign: 'center', fontSize: '.88rem' }}>
                No subjects assigned to this section yet.
              </div>
            )}

            {/* Working days */}
            <div>
              <label className="form-label">Working Days</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {days.map(d => (
                  <label key={d} style={{
                    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '.85rem',
                    padding: '5px 12px', borderRadius: 99,
                    border: `1px solid ${genDays.includes(d) ? 'var(--primary)' : 'var(--border)'}`,
                    background: genDays.includes(d) ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                    color: genDays.includes(d) ? 'var(--primary)' : 'var(--text)',
                  }}>
                    <input type="checkbox" style={{ display: 'none' }} checked={genDays.includes(d)}
                      onChange={e => setGenDays(p => e.target.checked ? [...p, d] : p.filter(x => x !== d))} />
                    {DAY_SHORT[d]}
                  </label>
                ))}
              </div>
            </div>

            {/* Periods per week */}
            {subjects.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Periods per Week</label>
                  <span style={{ fontSize: '.8rem', color: totalPeriods > availableSlots ? '#ef4444' : 'var(--text-muted)' }}>
                    {totalPeriods} / {availableSlots} slots
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {subjects.map(s => (
                    <div key={s._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{s.subjectName}</div>
                        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{s.teacher?.name || 'No teacher'}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className="btn btn-secondary btn-sm" style={{ width: 28, padding: 0, textAlign: 'center' }}
                          onClick={() => setPpw(p => ({ ...p, [s._id]: Math.max(0, (p[s._id] || 0) - 1) }))}>−</button>
                        <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{ppw[s._id] || 0}</span>
                        <button className="btn btn-secondary btn-sm" style={{ width: 28, padding: 0, textAlign: 'center' }}
                          onClick={() => setPpw(p => ({ ...p, [s._id]: (p[s._id] || 0) + 1 }))}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={generating || !subjects.length || totalPeriods === 0} onClick={onGenerate}>
                {generating ? 'Generating…' : '⚡ Generate'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Saturday badge ──────────────────────────────────────────────────────── */
function SaturdayBadge({ config }) {
  if (!config) return null;

  const SAT_MODE_LABEL = { all: 'All Saturdays', '1_3_5': '1st, 3rd & 5th Sat', '2_4': '2nd & 4th Sat' };

  let label, bg, color;
  if (!config.working) {
    label = 'Saturday Off';
    bg    = 'rgba(239,68,68,.1)';
    color = '#ef4444';
  } else if (config.halfDay) {
    label = `${SAT_MODE_LABEL[config.mode] || 'Saturday'} — Half Day`;
    bg    = 'rgba(245,158,11,.12)';
    color = '#d97706';
  } else {
    label = `${SAT_MODE_LABEL[config.mode] || 'Saturday'} Working`;
    bg    = 'rgba(34,197,94,.12)';
    color = '#16a34a';
  }

  return (
    <span style={{
      fontSize: '.78rem', fontWeight: 600, padding: '3px 10px',
      borderRadius: 99, background: bg, color,
      border: `1px solid ${color}33`,
      whiteSpace: 'nowrap',
    }}>
      🗓 {label}
    </span>
  );
}
