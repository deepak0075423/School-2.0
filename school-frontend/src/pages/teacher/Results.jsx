import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/teacher.api';
import { PageHeader, Table, Button, Badge, Modal, Spinner } from '../../components/ui/index';

const EXAM_STATUS = {
  MARKS_PENDING:  { label: 'Marks pending', variant: 'warning' },
  SUBMITTED:      { label: 'Submitted',     variant: 'info' },
  CLASS_APPROVED: { label: 'Class approved',variant: 'primary' },
  FINAL_APPROVED: { label: 'Final',         variant: 'success' },
  REOPENED:       { label: 'Reopened',      variant: 'danger' },
};

// ── Marks entry form (formal exams) ──────────────────────────────────────────
function MarksModal({ exam, subject, onClose }) {
  const [state, setState]   = useState(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await api.getMarksForm(exam._id, subject._id);
        const { students, sheet, subjectConfig } = res.data;
        const byId = Object.fromEntries((sheet?.entries || []).map(e => [String(e.student), e]));
        setState({
          subjectConfig,
          sheetStatus: sheet?.status || 'DRAFT',
          rows: students.map(s => ({
            student: s, marksObtained: byId[String(s._id)]?.marksObtained ?? '',
            isAbsent: byId[String(s._id)]?.isAbsent || false,
            remarks:  byId[String(s._id)]?.remarks || '',
          })),
        });
      } catch (err) { toast.error(err.message); onClose(); }
    })();
  }, [exam._id, subject._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (i, patch) => setState(st => {
    const rows = [...st.rows];
    rows[i] = { ...rows[i], ...patch };
    return { ...st, rows };
  });

  const save = async (submit) => {
    const max = state.subjectConfig?.maxMarks;
    for (const r of state.rows) {
      if (!r.isAbsent && r.marksObtained !== '' && max && +r.marksObtained > max)
        return toast.error(`${r.student.name}: marks exceed maximum (${max})`);
    }
    if (submit && state.rows.some(r => !r.isAbsent && r.marksObtained === ''))
      return toast.error('Enter marks (or mark absent) for every student before submitting');

    setSaving(true);
    try {
      await api.saveMarks(exam._id, subject._id, {
        submit,
        entries: state.rows.map(r => ({
          student: r.student._id,
          marksObtained: r.isAbsent || r.marksObtained === '' ? null : +r.marksObtained,
          isAbsent: r.isAbsent,
          remarks: r.remarks,
        })),
      });
      toast.success(submit ? 'Marks submitted for validation' : 'Draft saved');
      onClose(true);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={() => onClose()} maxWidth={720}
      title={`Marks — ${exam.title} · ${subject.subjectName || subject.name}`}
      footer={state && state.sheetStatus !== 'SUBMITTED' && <>
        <Button variant="secondary" loading={saving} onClick={() => save(false)}>Save draft</Button>
        <Button loading={saving} onClick={() => save(true)}>Submit for validation</Button>
      </>}>
      {!state ? (
        <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : (
        <>
          <div style={{ marginBottom: 10, fontSize: '.85rem', color: 'var(--text-muted)' }}>
            Max marks: <strong>{state.subjectConfig?.maxMarks ?? '—'}</strong> · Passing: <strong>{state.subjectConfig?.passingMarks ?? '—'}</strong>
            {state.sheetStatus === 'SUBMITTED' && <span style={{ marginLeft: 8 }}><Badge variant="info">already submitted</Badge></span>}
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Student</th><th style={{ width: 110 }}>Marks</th><th style={{ width: 80 }}>Absent</th><th>Remarks</th></tr></thead>
              <tbody>
                {state.rows.map((r, i) => (
                  <tr key={r.student._id}>
                    <td>{r.student.name}</td>
                    <td>
                      <input type="number" className="form-control" min="0" max={state.subjectConfig?.maxMarks}
                        disabled={r.isAbsent} value={r.marksObtained}
                        onChange={e => setRow(i, { marksObtained: e.target.value })} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={r.isAbsent}
                        onChange={e => setRow(i, { isAbsent: e.target.checked, marksObtained: e.target.checked ? '' : r.marksObtained })} />
                    </td>
                    <td>
                      <input className="form-control" value={r.remarks}
                        onChange={e => setRow(i, { remarks: e.target.value })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Class test marks form ─────────────────────────────────────────────────────
function TestMarksModal({ test, onClose }) {
  const [state, setState]   = useState(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await api.getTestMarks(test._id);
        setState({
          test: res.data.test,
          rows: res.data.entries.map(e => ({ ...e, marksObtained: e.marksObtained ?? '' })),
        });
      } catch (err) { toast.error(err.message); onClose(); }
    })();
  }, [test._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRow = (i, patch) => setState(st => {
    const rows = [...st.rows];
    rows[i] = { ...rows[i], ...patch };
    return { ...st, rows };
  });

  const save = async (submit) => {
    setSaving(true);
    try {
      await api.saveTestMarks(test._id, {
        submit,
        marks: state.rows.map(r => ({
          student: r._id,
          marksObtained: r.isAbsent || r.marksObtained === '' ? null : +r.marksObtained,
          isAbsent: !!r.isAbsent,
          remarks: r.remarks || '',
        })),
      });
      toast.success(submit ? 'Marks submitted' : 'Draft saved');
      onClose(true);
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={() => onClose()} maxWidth={680}
      title={`Marks — ${test.title}`}
      footer={state && <>
        <Button variant="secondary" loading={saving} onClick={() => save(false)}>Save draft</Button>
        <Button loading={saving} onClick={() => save(true)}>Submit</Button>
      </>}>
      {!state ? (
        <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Student</th><th style={{ width: 130 }}>Marks /{state.test.maxMarks}</th><th style={{ width: 80 }}>Absent</th></tr></thead>
            <tbody>
              {state.rows.map((r, i) => (
                <tr key={r._id}>
                  <td>{r.name}</td>
                  <td>
                    <input type="number" className="form-control" min="0" max={state.test.maxMarks}
                      disabled={!!r.isAbsent} value={r.marksObtained}
                      onChange={e => setRow(i, { marksObtained: e.target.value })} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={!!r.isAbsent}
                      onChange={e => setRow(i, { isAbsent: e.target.checked, marksObtained: e.target.checked ? '' : r.marksObtained })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ── Validation detail (class teacher) ─────────────────────────────────────────
function ValidationModal({ exam, onClose }) {
  const [detail, setDetail]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [remarks, setRemarks] = useState('');

  React.useEffect(() => {
    (async () => {
      try {
        const res = await api.getValidationDetail(exam._id);
        setDetail(res.data);
      } catch (err) { toast.error(err.message); onClose(); }
    })();
  }, [exam._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (approve) => {
    if (!approve && !remarks.trim()) return toast.error('Provide rejection remarks');
    setBusy(true);
    try {
      if (approve) await api.approveValidation(exam._id, { remarks });
      else         await api.rejectValidation(exam._id, { remarks });
      toast.success(approve ? 'Results approved and sent to admin' : 'Results rejected — sent back to subject teachers');
      onClose(true);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const sheets = detail?.sheets || detail?.exam?.sheets || [];

  return (
    <Modal open onClose={() => onClose()} maxWidth={680} title={`Validate — ${exam.title}`}
      footer={detail && <>
        <Button variant="danger" loading={busy} onClick={() => act(false)}>✗ Reject</Button>
        <Button loading={busy} onClick={() => act(true)}>✓ Approve</Button>
      </>}>
      {!detail ? (
        <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            {sheets.map(s => (
              <div key={s._id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '.9rem' }}>
                <span>{s.subject?.subjectName || s.subject?.name || 'Subject'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>
                  {s.submittedBy?.name ? `by ${s.submittedBy.name}` : ''} · {s.entries?.length || 0} entries
                </span>
                <Badge variant={s.status === 'SUBMITTED' ? 'success' : 'warning'}>{s.status}</Badge>
              </div>
            ))}
            {!sheets.length && <p style={{ color: 'var(--text-muted)' }}>No marks sheets found.</p>}
          </div>
          <div className="form-group">
            <label className="form-label">Remarks (required to reject)</label>
            <input className="form-control" value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TeacherResults() {
  const [tab, setTab] = useState('marks-entry');
  const { data: marksExams, loading: ml, refetch: refetchMarks } = useFetch(api.getMarksEntry);
  const { data: classTests, loading: cl, refetch: refetchTests } = useFetch(api.getClassTests);
  const { data: validation, loading: vl, refetch: refetchVal }   = useFetch(api.getValidation);
  const { data: meta } = useFetch(api.getExamMeta);

  const [marksTarget, setMarksTarget] = useState(null);   // { exam, subject }
  const [testTarget, setTestTarget]   = useState(null);
  const [valTarget, setValTarget]     = useState(null);
  const [testModal, setTestModal]     = useState(false);
  const [testForm, setTestForm]       = useState({ sectionId: '', subjectId: '', title: '', testDate: '', maxMarks: 20, passingMarks: 8, topic: '' });
  const [testSaving, setTestSaving]   = useState(false);

  const createTest = async (e) => {
    e.preventDefault();
    setTestSaving(true);
    try {
      await api.createClassTest(testForm);
      toast.success('Class test created');
      setTestModal(false);
      refetchTests();
    } catch (err) { toast.error(err.message); }
    finally { setTestSaving(false); }
  };

  const marksColumns = [
    { key: 'title',   label: 'Exam',    render: r => (
      <div>
        <strong>{r.title}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.section?.sectionName || ''}{r.examType ? ` · ${r.examType}` : ''}</div>
      </div>
    )},
    { key: 'status',  label: 'Status',  render: r => {
      const s = EXAM_STATUS[r.status] || { label: r.status, variant: 'muted' };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    }},
    { key: 'actions', label: 'My subjects', render: r => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(r.mySubjects || []).map(sub => (
          <Button key={sub._id} size="sm" variant="secondary"
            onClick={() => setMarksTarget({ exam: r, subject: sub })}>
            ✏️ {sub.subjectName || sub.name}
          </Button>
        ))}
      </div>
    )},
  ];

  const testColumns = [
    { key: 'title',   label: 'Test',    render: r => (
      <div>
        <strong>{r.title}</strong>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{r.subject?.subjectName || r.subject?.name || ''}{r.topic ? ` · ${r.topic}` : ''}</div>
      </div>
    )},
    { key: 'date',    label: 'Date',    render: r => r.testDate ? new Date(r.testDate).toLocaleDateString('en-IN') : '—' },
    { key: 'maxMarks',label: 'Max',     render: r => r.maxMarks },
    { key: 'status',  label: 'Status',  render: r =>
      <Badge variant={r.status === 'FINAL_APPROVED' ? 'success' : r.status === 'SUBMITTED' ? 'info' : 'warning'}>{r.status || 'DRAFT'}</Badge> },
    { key: 'actions', label: '', render: r => r.status !== 'FINAL_APPROVED' && (
      <Button size="sm" variant="secondary" onClick={() => setTestTarget(r)}>Enter marks</Button>
    )},
  ];

  const valColumns = [
    { key: 'title',  label: 'Exam',   render: r => <strong>{r.title}</strong> },
    { key: 'section',label: 'Section',render: r => r.section?.sectionName || '—' },
    { key: 'status', label: 'Status', render: r => {
      const s = EXAM_STATUS[r.status] || { label: r.status, variant: 'muted' };
      return <Badge variant={s.variant}>{s.label}</Badge>;
    }},
    { key: 'actions', label: '', render: r => (
      <Button size="sm" onClick={() => setValTarget(r)}>Review & approve</Button>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Results & Marks" subtitle="Enter, validate and track exam marks" />

      <div className="tabs">
        {[['marks-entry','Marks Entry'],['class-tests','Class Tests'],['validation','Validation']].map(([k,l]) => (
          <button key={k} className={`tab${tab===k?' active':''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'marks-entry' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {ml ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={marksColumns} data={marksExams} emptyIcon="📊" emptyTitle="No exams awaiting marks from you" />}
          </div>
        </div>
      )}

      {tab === 'class-tests' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span />
            <Button size="sm" onClick={() => setTestModal(true)}>+ Create Test</Button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {cl ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={testColumns} data={classTests} emptyIcon="📝" emptyTitle="No class tests" />}
          </div>
        </div>
      )}

      {tab === 'validation' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {vl ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={valColumns} data={validation} emptyIcon="✅" emptyTitle="Nothing awaiting your validation" />}
          </div>
        </div>
      )}

      {marksTarget && (
        <MarksModal exam={marksTarget.exam} subject={marksTarget.subject}
          onClose={(changed) => { setMarksTarget(null); if (changed) refetchMarks(); }} />
      )}
      {testTarget && (
        <TestMarksModal test={testTarget}
          onClose={(changed) => { setTestTarget(null); if (changed) refetchTests(); }} />
      )}
      {valTarget && (
        <ValidationModal exam={valTarget}
          onClose={(changed) => { setValTarget(null); if (changed) refetchVal(); }} />
      )}

      {/* Create class test */}
      <Modal open={testModal} onClose={() => setTestModal(false)} title="Create Class Test"
        footer={<>
          <Button variant="secondary" onClick={() => setTestModal(false)}>Cancel</Button>
          <Button form="test-form" type="submit" loading={testSaving}>Create</Button>
        </>}>
        <form id="test-form" onSubmit={createTest}>
          <div className="form-group">
            <label className="form-label required">Title</label>
            <input className="form-control" required value={testForm.title}
              onChange={e => setTestForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Section</label>
              <select className="form-control" required value={testForm.sectionId}
                onChange={e => setTestForm(f => ({ ...f, sectionId: e.target.value }))}>
                <option value="">Select…</option>
                {(meta?.sections || []).map(s => (
                  <option key={s._id} value={s._id}>
                    {s.class?.className ? `${s.class.className} — ` : ''}{s.sectionName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label required">Subject</label>
              <select className="form-control" required value={testForm.subjectId}
                onChange={e => setTestForm(f => ({ ...f, subjectId: e.target.value }))}>
                <option value="">Select…</option>
                {(meta?.subjects || []).map(s => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Date</label>
              <input type="date" className="form-control" required value={testForm.testDate}
                onChange={e => setTestForm(f => ({ ...f, testDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Topic</label>
              <input className="form-control" value={testForm.topic}
                onChange={e => setTestForm(f => ({ ...f, topic: e.target.value }))} />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Max Marks</label>
              <input type="number" min="1" className="form-control" required value={testForm.maxMarks}
                onChange={e => setTestForm(f => ({ ...f, maxMarks: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Passing Marks</label>
              <input type="number" min="0" className="form-control" required value={testForm.passingMarks}
                onChange={e => setTestForm(f => ({ ...f, passingMarks: +e.target.value }))} />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
