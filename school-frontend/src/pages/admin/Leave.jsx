import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner, Pagination } from '../../components/ui/index';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_VARIANT = {
  pending: 'warning', approved: 'success', rejected: 'danger',
  cancelled: 'muted', modification_requested: 'info',
};

const EMPTY_TYPE = {
  name: '', code: '', annualAllocation: 12,
  monthlyAccrual: { enabled: false, daysPerMonth: 0 },
  carryForward: { enabled: false, maxDays: 0 },
  encashable: false, maxEncashableDays: 0,
  maxConsecutiveDays: 0, requiresDocument: false, documentRequiredAfterDays: 0, isActive: true,
};

const EMPTY_APPLY = { teacherId: '', leaveTypeId: '', fromDate: '', toDate: '', leaveMode: 'full_day', reason: '' };
const EMPTY_ALLOC = {
  teacherMode: 'all',        // 'all' | 'select' | 'except'
  checkedTeachers: [],       // 'select': included ids  |  'except': excluded ids
  leaveTypeId: '',
  giveFullAllocation: true,
  useProration: false,
  overrideDays: '',
};

function computeProration(annualAllocation, activeAY) {
  if (!activeAY?.startDate || !activeAY?.endDate || !annualAllocation) return annualAllocation;
  const now   = new Date();
  const end   = new Date(activeAY.endDate);
  const start = new Date(activeAY.startDate);
  if (now <= start) return annualAllocation;
  if (now >= end)   return 0;
  const totalMs  = end - start;
  const remainMs = end - now;
  return Math.max(1, Math.ceil(annualAllocation * remainMs / totalMs));
}

function downloadBuffer(data, filename) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminLeave() {
  const [tab, setTab] = useState('requests');

  // ── Requests ─────────────────────────────────────────────────────────────────
  const [reqPage,      setReqPage]      = useState(1);
  const [reqStatus,    setReqStatus]    = useState('');
  const [reqTeacher,   setReqTeacher]   = useState('');
  const [reqLeaveType, setReqLeaveType] = useState('');
  const [reqFromDate,  setReqFromDate]  = useState('');
  const [reqToDate,    setReqToDate]    = useState('');
  const [actionModal, setActionModal] = useState(null); // { type, request }
  const [comment,   setComment]   = useState('');
  const [actLoad,   setActLoad]   = useState(false);

  const { data: reqData, loading: reqLoading, refetch: refetchReq } = useFetch(
    () => api.getLeaveRequests({
      page: reqPage, limit: 20,
      status:    reqStatus    || undefined,
      teacherId: reqTeacher   || undefined,
      leaveType: reqLeaveType || undefined,
      fromDate:  reqFromDate  || undefined,
      toDate:    reqToDate    || undefined,
    }),
    [reqPage, reqStatus, reqTeacher, reqLeaveType, reqFromDate, reqToDate],
  );

  const { data: teachers } = useFetch(() => api.getTeachers({ limit: 500 }));
  const teacherList = teachers?.data || [];

  const handleAction = async () => {
    if (!actionModal) return;
    setActLoad(true);
    try {
      const { type, request } = actionModal;
      if (type === 'approve')   await api.approveLeave(request._id, { adminComment: comment });
      else if (type === 'reject')  await api.rejectLeave(request._id, { adminComment: comment });
      else if (type === 'modify')  await api.requestLeaveModification(request._id, { adminComment: comment });
      toast.success(type === 'approve' ? 'Leave approved' : type === 'reject' ? 'Leave rejected' : 'Modification requested');
      setActionModal(null); setComment('');
      refetchReq();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setActLoad(false); }
  };

  // ── Apply leave (admin on behalf of teacher) ──────────────────────────────────
  const [applyModal, setApplyModal] = useState(false);
  const [applyForm,  setApplyForm]  = useState(EMPTY_APPLY);
  const [applyLoad,  setApplyLoad]  = useState(false);
  const applyDocRef = useRef();

  const handleApply = async (e) => {
    e.preventDefault();
    setApplyLoad(true);
    try {
      const fd = new FormData();
      fd.append('teacherId',   applyForm.teacherId);
      fd.append('leaveTypeId', applyForm.leaveTypeId);
      fd.append('fromDate',    applyForm.fromDate);
      fd.append('toDate',      applyForm.toDate);
      fd.append('leaveMode',   applyForm.leaveMode);
      fd.append('reason',      applyForm.reason);
      if (applyDocRef.current?.files?.[0]) fd.append('document', applyDocRef.current.files[0]);
      await api.adminApplyLeave(fd);
      toast.success('Leave applied');
      setApplyModal(false); setApplyForm(EMPTY_APPLY);
      if (applyDocRef.current) applyDocRef.current.value = '';
      refetchReq();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setApplyLoad(false); }
  };

  const reqColumns = [
    { key: 'teacher',  label: 'Teacher',  render: r => <div><div style={{ fontWeight: 600 }}>{r.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.teacher?.employeeId || ''}</div></div> },
    { key: 'type',     label: 'Type',     render: r => r.leaveType?.name || '—' },
    { key: 'dates',    label: 'Period',   render: r => <div><div>{fmtDate(r.fromDate)} – {fmtDate(r.toDate)}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.totalDays} day(s) · {r.leaveMode?.replace('_', ' ')}</div></div> },
    { key: 'status',   label: 'Status',   render: r => <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status?.replace('_', ' ')}</Badge> },
    { key: 'reason',   label: 'Reason',   render: r => <span style={{ fontSize: '.82rem' }}>{r.reason || '—'}</span> },
    { key: 'doc',      label: 'Doc',      render: r => r.document ? <a href={`/uploads/leave-docs/${r.document}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>📎 View</a> : '—' },
    { key: 'actions',  label: '',         render: r => r.status === 'pending' || r.status === 'modification_requested' ? (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-success btn-sm" onClick={() => { setComment(''); setActionModal({ type: 'approve', request: r }); }}>Approve</button>
        <button className="btn btn-danger btn-sm"  onClick={() => { setComment(''); setActionModal({ type: 'reject',  request: r }); }}>Reject</button>
        {r.status === 'pending' && <button className="btn btn-secondary btn-sm" onClick={() => { setComment(''); setActionModal({ type: 'modify', request: r }); }}>Modify</button>}
      </div>
    ) : null },
  ];

  // ── Leave Types ───────────────────────────────────────────────────────────────
  const [typeModal, setTypeModal] = useState(false);
  const [editType,  setEditType]  = useState(null);
  const [typeForm,  setTypeForm]  = useState(EMPTY_TYPE);
  const [typeLoad,  setTypeLoad]  = useState(false);
  const [delType,   setDelType]   = useState(null);
  const [delLoad,   setDelLoad]   = useState(false);
  const { data: typesData, refetch: refetchTypes } = useFetch(api.getLeaveTypes);
  const leaveTypes = typesData || [];

  // Refetch fresh data whenever the user switches to a tab
  useEffect(() => {
    if (tab === 'types')       refetchTypes();
    if (tab === 'requests')    refetchReq();
    if (tab === 'allocations') refetchAlloc();
    if (tab === 'balance')     refetchAlloc();
  }, [tab]);

  const openCreateType = () => { setTypeForm(EMPTY_TYPE); setEditType(null); setTypeModal(true); };
  const openEditType   = (t) => {
    setTypeForm({
      name: t.name, code: t.code, annualAllocation: t.annualAllocation,
      monthlyAccrual:            t.monthlyAccrual           || { enabled: false, daysPerMonth: 0 },
      carryForward:              t.carryForward             || { enabled: false, maxDays: 0 },
      encashable:                !!t.encashable,
      maxEncashableDays:         t.maxEncashableDays        || 0,
      maxConsecutiveDays:        t.maxConsecutiveDays       || 0,
      requiresDocument:          !!t.requiresDocument,
      documentRequiredAfterDays: t.documentRequiredAfterDays || 0,
      isActive:                  t.isActive !== false,
    });
    setEditType(t); setTypeModal(true);
  };

  const handleSaveType = async (e) => {
    e.preventDefault();
    setTypeLoad(true);
    try {
      if (editType) await api.updateLeaveType(editType._id, typeForm);
      else          await api.createLeaveType(typeForm);
      toast.success(editType ? 'Leave type updated' : 'Leave type saved');
      setTypeModal(false); refetchTypes();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
    finally { setTypeLoad(false); }
  };

  const handleDeleteType = async () => {
    setDelLoad(true);
    try {
      await api.deleteLeaveType(delType._id);
      toast.success('Leave type deleted');
      setDelType(null); refetchTypes();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDelLoad(false); }
  };

  const typeColumns = [
    { key: 'name',  label: 'Leave Type', render: t => <strong>{t.name}</strong> },
    { key: 'code',  label: 'Code',       render: t => <code style={{ background: 'var(--bg-muted)', padding: '2px 6px', borderRadius: 4 }}>{t.code}</code> },
    { key: 'alloc', label: 'Annual',     render: t => `${t.annualAllocation} days` },
    { key: 'cf',    label: 'Carry Fwd',  render: t => t.carryForward?.enabled ? `Yes (max ${t.carryForward.maxDays})` : 'No' },
    { key: 'doc',   label: 'Doc Req.',   render: t => t.requiresDocument ? '✓' : '—' },
    { key: 'status',label: 'Status',     render: t => <Badge variant={t.isActive ? 'success' : 'muted'}>{t.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: '', render: t => (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => openEditType(t)}>Edit</button>
        <button className="btn btn-danger btn-sm"    onClick={() => setDelType(t)}>Delete</button>
      </div>
    )},
  ];

  // ── Allocations ───────────────────────────────────────────────────────────────
  const [allocModal,  setAllocModal]  = useState(false);
  const [allocForm,   setAllocForm]   = useState(EMPTY_ALLOC);
  const [allocLoad,   setAllocLoad]   = useState(false);
  const [accrualLoad, setAccrualLoad] = useState(false);
  const [cfModal,     setCfModal]     = useState(false);
  const [cfForm,      setCfForm]      = useState({ fromYear: '', toYear: '' });
  const [cfLoad,      setCfLoad]      = useState(false);
  const [importLoad,      setImportLoad]      = useState(false);
  const [allocImportModal, setAllocImportModal] = useState(false);
  const allocFileRef  = useRef();
  const { data: allocData, refetch: refetchAlloc } = useFetch(api.getLeaveAllocations);
  const allocations = allocData || [];

  const { data: ayData } = useFetch(api.getAcademicYears);
  const activeAY = (ayData || []).find(ay => ay.status === 'active');

  const handleAllocate = async (e) => {
    e.preventDefault();
    if (allocForm.teacherMode === 'select' && !allocForm.checkedTeachers.length) {
      toast.error('Select at least one teacher'); return;
    }
    setAllocLoad(true);
    try {
      const payload = {
        teacherIds:          allocForm.teacherMode === 'select' ? allocForm.checkedTeachers : 'all',
        excludeIds:          allocForm.teacherMode === 'except' ? allocForm.checkedTeachers : [],
        leaveTypeId:         allocForm.leaveTypeId,
        giveFullAllocation:  allocForm.giveFullAllocation,
        useProration:        allocForm.useProration,
        overrideDays:        allocForm.overrideDays !== '' ? Number(allocForm.overrideDays) : undefined,
      };
      const res = await api.allocateLeave(payload);
      toast.success(res?.message || 'Leave allocated');
      setAllocModal(false); setAllocForm(EMPTY_ALLOC); refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setAllocLoad(false); }
  };

  const handleRunAccrual = async () => {
    setAccrualLoad(true);
    try {
      const res = await api.runLeaveAccrual();
      toast.success(res?.message || `Accrual complete — ${res?.credited || 0} updated`);
      refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setAccrualLoad(false); }
  };

  const handleCarryForward = async (e) => {
    e.preventDefault();
    setCfLoad(true);
    try {
      const res = await api.runCarryForward(cfForm);
      toast.success(`Carry-forward complete. ${res?.data?.processed || 0} balances updated`);
      setCfModal(false); setCfForm({ fromYear: '', toYear: '' }); refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setCfLoad(false); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await api.downloadAllocationTemplate();
      downloadBuffer(res?.data ?? res, 'leave_allocation_template.xlsx');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const handleBulkImport = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImportLoad(true);
    try {
      const fd = new FormData(); fd.append('excelFile', file);
      const res = await api.bulkAllocateLeaveExcel(fd);
      toast.success(`Imported. Updated: ${res?.updated ?? 0}${res?.errors?.length ? `, Errors: ${res.errors.length}` : ''}`);
      setAllocImportModal(false);
      refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setImportLoad(false); e.target.value = ''; }
  };


  // ── Detail popups & filters ───────────────────────────────────────────────────
  const [detailModal,    setDetailModal]    = useState(null); // { teacher, ay, balances }
  const [repDetailModal, setRepDetailModal] = useState(null); // { teacher, apps }
  const [allocFilter,    setAllocFilter]    = useState({ teacher: '', leaveType: '' });

  // ── Reports ───────────────────────────────────────────────────────────────────
  const [repStatus, setRepStatus] = useState('');
  const [exportLoad,      setExportLoad]      = useState(false);
  const [reqExportLoad,   setReqExportLoad]   = useState(false);
  const [allocExportLoad, setAllocExportLoad] = useState(false);
  const { data: repData, loading: repLoading } = useFetch(
    () => api.getLeaveReports({ status: repStatus || undefined }),
    [repStatus],
  );

  const handleExport = async () => {
    setExportLoad(true);
    try {
      const res = await api.exportLeaveReports({ status: repStatus || undefined });
      downloadBuffer(res?.data ?? res, 'leave_report.xlsx');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setExportLoad(false); }
  };

  const handleExportRequests = async () => {
    setReqExportLoad(true);
    try {
      const res = await api.exportLeaveRequests({
        status:    reqStatus    || undefined,
        teacherId: reqTeacher   || undefined,
        leaveType: reqLeaveType || undefined,
        fromDate:  reqFromDate  || undefined,
        toDate:    reqToDate    || undefined,
      });
      downloadBuffer(res?.data ?? res, 'leave_requests.xlsx');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setReqExportLoad(false); }
  };

  const handleExportAllocations = async () => {
    setAllocExportLoad(true);
    try {
      const res = await api.exportLeaveAllocations();
      downloadBuffer(res?.data ?? res, 'leave_allocations.xlsx');
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setAllocExportLoad(false); }
  };


  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <PageHeader title="Leave Management" subtitle="Manage leave types, requests, and allocations"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'requests' && <>
              <Button variant="secondary" onClick={handleExportRequests} loading={reqExportLoad}>Export Excel</Button>
              <Button onClick={() => { setApplyForm(EMPTY_APPLY); setApplyModal(true); }}>+ Apply Leave</Button>
            </>}
            {tab === 'types'    && <Button onClick={openCreateType}>+ Add Type</Button>}
            {tab === 'allocations' && (
              <>
                <Button variant="secondary" onClick={() => setAllocImportModal(true)}>Import Excel</Button>
                <Button variant="secondary" onClick={() => setCfModal(true)}>Carry Forward</Button>
                <Button variant="secondary" onClick={handleExportAllocations} loading={allocExportLoad}>Export Excel</Button>
                <Button variant="secondary" onClick={handleRunAccrual} loading={accrualLoad}>Run Accrual</Button>
                <Button onClick={() => { setAllocForm(EMPTY_ALLOC); setAllocModal(true); }}>+ Allocate</Button>
              </>
            )}
            {tab === 'balance' && (
              <Button variant="secondary" onClick={handleExportAllocations} loading={allocExportLoad}>Export Excel</Button>
            )}
            {tab === 'reports' && <Button onClick={handleExport} loading={exportLoad}>Export Excel</Button>}
          </div>
        }
      />

      <div className="tabs">
        {[['requests','Requests'],['types','Leave Types'],['allocations','Allocations'],['balance','Balance Summary'],['reports','Reports']].map(([key, label]) => (
          <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* ── Requests ── */}
      {tab === 'requests' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ width: 150 }} value={reqStatus} onChange={e => { setReqStatus(e.target.value); setReqPage(1); }}>
              <option value="">All Statuses</option>
              {['pending','approved','rejected','cancelled','modification_requested'].map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <select className="form-control" style={{ width: 160 }} value={reqTeacher} onChange={e => { setReqTeacher(e.target.value); setReqPage(1); }}>
              <option value="">All Teachers</option>
              {teacherList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <select className="form-control" style={{ width: 150 }} value={reqLeaveType} onChange={e => { setReqLeaveType(e.target.value); setReqPage(1); }}>
              <option value="">All Types</option>
              {leaveTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
            <input type="date" className="form-control" style={{ width: 140 }} value={reqFromDate}
              onChange={e => { setReqFromDate(e.target.value); setReqPage(1); }} title="From date" />
            <input type="date" className="form-control" style={{ width: 140 }} value={reqToDate}
              onChange={e => { setReqToDate(e.target.value); setReqPage(1); }} title="To date" />
            {(reqStatus || reqTeacher || reqLeaveType || reqFromDate || reqToDate) && (
              <button className="btn btn-secondary btn-sm" onClick={() => {
                setReqStatus(''); setReqTeacher(''); setReqLeaveType('');
                setReqFromDate(''); setReqToDate(''); setReqPage(1);
              }}>Clear</button>
            )}
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {reqLoading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={reqColumns} data={reqData || []} emptyIcon="🏖️" emptyTitle="No leave requests" />}
          </div>
          {reqData?.pages > 1 && (
            <div className="card-footer">
              <Pagination page={reqPage} pages={reqData.pages} total={reqData.total} onPage={setReqPage} />
            </div>
          )}
        </div>
      )}

      {/* ── Leave Types ── */}
      {tab === 'types' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <Table columns={typeColumns} data={leaveTypes} emptyIcon="📋" emptyTitle="No leave types yet" />
          </div>
        </div>
      )}

      {/* ── Allocations (one row per teacher, inline leave types) ── */}
      {tab === 'allocations' && (() => {
        const filtered = (allocations || []).filter(a => {
          if (allocFilter.teacher   && a.teacher?._id?.toString()   !== allocFilter.teacher)   return false;
          if (allocFilter.leaveType && a.leaveType?._id?.toString() !== allocFilter.leaveType) return false;
          return true;
        });
        const tmap = {}; const torder = [];
        filtered.forEach(a => {
          const tid = a.teacher?._id?.toString() || 'unknown';
          if (!tmap[tid]) { tmap[tid] = { teacher: a.teacher, ay: a.academicYear, balances: [] }; torder.push(tid); }
          tmap[tid].balances.push(a);
        });
        const groups = torder.map(tid => tmap[tid]);

        const inlineNums = (balances, field) => (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {balances.map(b => (
              <span key={b.leaveType?._id} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>
                <strong>{b.leaveType?.code}</strong>: {b[field] || 0}
              </span>
            ))}
          </div>
        );

        const cols = [
          { key: 'teacher',   label: 'Teacher',    render: g => <div><div style={{ fontWeight: 600 }}>{g.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{g.teacher?.employeeId || ''}</div></div> },
          { key: 'allocated', label: 'Allocated',  render: g => inlineNums(g.balances, 'totalAllocated') },
          { key: 'cf',        label: 'Carry Fwd',  render: g => inlineNums(g.balances, 'carriedForward') },
          { key: 'used',      label: 'Used',       render: g => inlineNums(g.balances, 'used') },
          { key: 'remaining', label: 'Remaining',  render: g => (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {g.balances.map(b => {
                const rem = Math.max(0, (b.totalAllocated||0)+(b.carriedForward||0)-(b.used||0)-(b.pending||0));
                return (
                  <span key={b.leaveType?._id} style={{ fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap', color: rem > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {b.leaveType?.code}: {rem}
                  </span>
                );
              })}
            </div>
          )},
          { key: 'ay',      label: 'Year',    render: g => g.ay || '—' },
          { key: 'actions', label: '',        render: g => <button className="btn btn-secondary btn-sm" onClick={() => setDetailModal(g)}>Details</button> },
        ];

        return (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="form-control" style={{ width: 180 }} value={allocFilter.teacher} onChange={e => setAllocFilter(f => ({ ...f, teacher: e.target.value }))}>
                <option value="">All Teachers</option>
                {teacherList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              <select className="form-control" style={{ width: 160 }} value={allocFilter.leaveType} onChange={e => setAllocFilter(f => ({ ...f, leaveType: e.target.value }))}>
                <option value="">All Leave Types</option>
                {leaveTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              {(allocFilter.teacher || allocFilter.leaveType) && (
                <button className="btn btn-secondary btn-sm" onClick={() => setAllocFilter({ teacher: '', leaveType: '' })}>Clear</button>
              )}
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <Table columns={cols} data={groups} emptyIcon="📊" emptyTitle="No allocations found" />
            </div>
          </div>
        );
      })()}

      {/* ── Balance Summary (one row per teacher, inline remaining) ── */}
      {tab === 'balance' && (() => {
        const filtered = (allocations || []).filter(a => {
          if (allocFilter.teacher   && a.teacher?._id?.toString()   !== allocFilter.teacher)   return false;
          if (allocFilter.leaveType && a.leaveType?._id?.toString() !== allocFilter.leaveType) return false;
          return true;
        });
        const tmap = {}; const torder = [];
        filtered.forEach(a => {
          const tid = a.teacher?._id?.toString() || 'unknown';
          if (!tmap[tid]) { tmap[tid] = { teacher: a.teacher, ay: a.academicYear, balances: [] }; torder.push(tid); }
          tmap[tid].balances.push(a);
        });
        const groups = torder.map(tid => tmap[tid]);

        const balCols = [
          { key: 'teacher', label: 'Teacher', render: g => <div><div style={{ fontWeight: 600 }}>{g.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{g.teacher?.employeeId || ''}</div></div> },
          { key: 'balance', label: 'Remaining / Allocated', render: g => (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {g.balances.map(b => {
                const rem   = Math.max(0, (b.totalAllocated||0)+(b.carriedForward||0)-(b.used||0)-(b.pending||0));
                const total = (b.totalAllocated||0) + (b.carriedForward||0);
                return (
                  <span key={b.leaveType?._id} style={{
                    padding: '2px 10px', borderRadius: 12, fontSize: '.78rem', fontWeight: 600, whiteSpace: 'nowrap',
                    border: `1px solid ${rem > 0 ? 'var(--success)' : 'var(--danger)'}`,
                    color: rem > 0 ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {b.leaveType?.code}: {rem}/{total}
                  </span>
                );
              })}
            </div>
          )},
          { key: 'used',    label: 'Used',    render: g => (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {g.balances.map(b => <span key={b.leaveType?._id} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}><strong>{b.leaveType?.code}</strong>: {b.used||0}</span>)}
            </div>
          )},
          { key: 'pending', label: 'Pending', render: g => (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {g.balances.map(b => <span key={b.leaveType?._id} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}><strong>{b.leaveType?.code}</strong>: {b.pending||0}</span>)}
            </div>
          )},
          { key: 'ay',      label: 'Year',    render: g => g.ay || '—' },
          { key: 'actions', label: '',        render: g => <button className="btn btn-secondary btn-sm" onClick={() => setDetailModal(g)}>Details</button> },
        ];

        return (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="form-control" style={{ width: 180 }} value={allocFilter.teacher} onChange={e => setAllocFilter(f => ({ ...f, teacher: e.target.value }))}>
                <option value="">All Teachers</option>
                {teacherList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              <select className="form-control" style={{ width: 160 }} value={allocFilter.leaveType} onChange={e => setAllocFilter(f => ({ ...f, leaveType: e.target.value }))}>
                <option value="">All Leave Types</option>
                {leaveTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              {(allocFilter.teacher || allocFilter.leaveType) && (
                <button className="btn btn-secondary btn-sm" onClick={() => setAllocFilter({ teacher: '', leaveType: '' })}>Clear</button>
              )}
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <Table columns={balCols} data={groups} emptyIcon="📊" emptyTitle="No balance data. Allocate leaves first." />
            </div>
          </div>
        );
      })()}

      {/* ── Reports (one row per teacher from applications) ── */}
      {tab === 'reports' && (() => {
        const apps = repData?.applications || [];
        const tmap = {}; const torder = [];
        apps.forEach(a => {
          const tid = a.teacher?._id?.toString() || 'unknown';
          if (!tmap[tid]) { tmap[tid] = { teacher: a.teacher, apps: [] }; torder.push(tid); }
          tmap[tid].apps.push(a);
        });
        const repGroups = torder.map(tid => tmap[tid]);

        const repGroupCols = [
          { key: 'teacher', label: 'Teacher', render: g => <div><div style={{ fontWeight: 600 }}>{g.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{g.teacher?.employeeId || ''}</div></div> },
          { key: 'summary', label: 'Applications (days per type)', render: g => {
            const byType = {};
            g.apps.forEach(a => { const c = a.leaveType?.code || '?'; byType[c] = (byType[c] || 0) + (a.totalDays || 0); });
            return (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {Object.entries(byType).map(([code, days]) => (
                  <span key={code} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}><strong>{code}</strong>: {days}d</span>
                ))}
              </div>
            );
          }},
          { key: 'count',   label: 'Count',   render: g => `${g.apps.length} application(s)` },
          { key: 'actions', label: '',         render: g => <button className="btn btn-secondary btn-sm" onClick={() => setRepDetailModal(g)}>View All</button> },
        ];

        return (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="form-control" style={{ width: 160 }} value={repStatus} onChange={e => setRepStatus(e.target.value)}>
                <option value="">All Statuses</option>
                {['pending','approved','rejected','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {repLoading
                ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
                : <Table columns={repGroupCols} data={repGroups} emptyIcon="📄" emptyTitle="No applications" />
              }
            </div>
          </div>
        );
      })()}

      {/* ── Action Modal (Approve / Reject / Modify) ── */}
      <Modal open={!!actionModal} onClose={() => { setActionModal(null); setComment(''); }}
        title={actionModal?.type === 'approve' ? 'Approve Leave' : actionModal?.type === 'reject' ? 'Reject Leave' : 'Request Modification'}
        footer={<>
          <Button variant="secondary" onClick={() => { setActionModal(null); setComment(''); }}>Cancel</Button>
          <Button variant={actionModal?.type === 'approve' ? 'primary' : 'danger'} onClick={handleAction} loading={actLoad}>Confirm</Button>
        </>}>
        {actionModal && (
          <div>
            <p style={{ marginBottom: 12 }}>
              <strong>{actionModal.request.teacher?.name}</strong> — {actionModal.request.leaveType?.name}<br />
              <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{fmtDate(actionModal.request.fromDate)} – {fmtDate(actionModal.request.toDate)} ({actionModal.request.totalDays} day(s))</span>
            </p>
            <div className="form-group">
              <label className="form-label">Comment (optional)</label>
              <textarea className="form-control" rows={3} value={comment}
                onChange={e => setComment(e.target.value)} placeholder="Add a comment..." />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Admin Apply Modal ── */}
      <Modal open={applyModal} onClose={() => setApplyModal(false)} title="Apply Leave for Teacher"
        footer={<>
          <Button variant="secondary" onClick={() => setApplyModal(false)}>Cancel</Button>
          <Button form="admin-apply-form" type="submit" loading={applyLoad}>Apply</Button>
        </>}>
        <form id="admin-apply-form" onSubmit={handleApply}>
          <div className="form-group">
            <label className="form-label required">Teacher</label>
            <select className="form-control" required value={applyForm.teacherId}
              onChange={e => setApplyForm(f => ({ ...f, teacherId: e.target.value }))}>
              <option value="">Select teacher…</option>
              {teacherList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Leave Type</label>
            <select className="form-control" required value={applyForm.leaveTypeId}
              onChange={e => setApplyForm(f => ({ ...f, leaveTypeId: e.target.value }))}>
              <option value="">Select type…</option>
              {leaveTypes.filter(t => t.isActive).map(t => <option key={t._id} value={t._id}>{t.name} ({t.code})</option>)}
            </select>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">From</label>
              <input type="date" className="form-control" required value={applyForm.fromDate}
                onChange={e => setApplyForm(f => ({ ...f, fromDate: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">To</label>
              <input type="date" className="form-control" required value={applyForm.toDate}
                onChange={e => setApplyForm(f => ({ ...f, toDate: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Leave Mode</label>
            <select className="form-control" value={applyForm.leaveMode}
              onChange={e => setApplyForm(f => ({ ...f, leaveMode: e.target.value }))}>
              <option value="full_day">Full Day</option>
              <option value="half_day">Half Day</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Reason</label>
            <textarea className="form-control" rows={3} required value={applyForm.reason}
              onChange={e => setApplyForm(f => ({ ...f, reason: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Supporting Document <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>(optional)</span></label>
            <input ref={applyDocRef} type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>PDF, Word, or image — max 5 MB</span>
          </div>
        </form>
      </Modal>

      {/* ── Leave Type Modal ── */}
      <Modal open={typeModal} onClose={() => setTypeModal(false)} title={editType ? 'Edit Leave Type' : 'New Leave Type'}
        footer={<>
          <Button variant="secondary" onClick={() => setTypeModal(false)}>Cancel</Button>
          <Button form="type-form" type="submit" loading={typeLoad}>Save</Button>
        </>}>
        <form id="type-form" onSubmit={handleSaveType}>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">Name</label>
              <input type="text" className="form-control" required value={typeForm.name}
                onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label required">Code</label>
              <input type="text" className="form-control" required value={typeForm.code}
                onChange={e => setTypeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. CL, SL" />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Annual Allocation (days)</label>
              <input type="number" className="form-control" min={0} value={typeForm.annualAllocation}
                onChange={e => setTypeForm(f => ({ ...f, annualAllocation: +e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Max Consecutive Days</label>
              <input type="number" className="form-control" min={0} value={typeForm.maxConsecutiveDays}
                onChange={e => setTypeForm(f => ({ ...f, maxConsecutiveDays: +e.target.value }))} placeholder="0 = unlimited" />
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={typeForm.carryForward?.enabled || false}
                  onChange={e => setTypeForm(f => ({ ...f, carryForward: { ...f.carryForward, enabled: e.target.checked } }))} />
                Carry Forward
              </label>
              {typeForm.carryForward?.enabled && (
                <input type="number" className="form-control" min={0} value={typeForm.carryForward?.maxDays || 0}
                  placeholder="Max days to carry"
                  onChange={e => setTypeForm(f => ({ ...f, carryForward: { ...f.carryForward, maxDays: +e.target.value } }))} />
              )}
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={typeForm.requiresDocument || false}
                  onChange={e => setTypeForm(f => ({ ...f, requiresDocument: e.target.checked }))} />
                Requires Document
              </label>
              {typeForm.requiresDocument && (
                <input type="number" className="form-control" min={0} value={typeForm.documentRequiredAfterDays || 0}
                  placeholder="Required after N days (0 = always)"
                  onChange={e => setTypeForm(f => ({ ...f, documentRequiredAfterDays: +e.target.value }))} />
              )}
            </div>
          </div>
          <div className="form-row form-row-2">
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={typeForm.monthlyAccrual?.enabled || false}
                  onChange={e => setTypeForm(f => ({ ...f, monthlyAccrual: { ...f.monthlyAccrual, enabled: e.target.checked } }))} />
                Monthly Accrual
              </label>
              {typeForm.monthlyAccrual?.enabled && (
                <input type="number" className="form-control" min={0} step="0.5"
                  value={typeForm.monthlyAccrual?.daysPerMonth || 0}
                  placeholder="Days per month (e.g. 1)"
                  onChange={e => setTypeForm(f => ({ ...f, monthlyAccrual: { ...f.monthlyAccrual, daysPerMonth: +e.target.value } }))} />
              )}
            </div>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={typeForm.encashable || false}
                  onChange={e => setTypeForm(f => ({ ...f, encashable: e.target.checked }))} />
                Encashable
              </label>
              {typeForm.encashable && (
                <input type="number" className="form-control" min={0}
                  value={typeForm.maxEncashableDays || 0}
                  placeholder="Max encashable days (0 = no limit)"
                  onChange={e => setTypeForm(f => ({ ...f, maxEncashableDays: +e.target.value }))} />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={typeForm.isActive !== false}
                onChange={e => setTypeForm(f => ({ ...f, isActive: e.target.checked }))} />
              Active
            </label>
          </div>
        </form>
      </Modal>

      {/* ── Delete Type Confirm ── */}
      <Confirm open={!!delType} onClose={() => setDelType(null)} onConfirm={handleDeleteType}
        loading={delLoad} title="Delete Leave Type"
        message={`Delete "${delType?.name}"? This cannot be undone.`} />

      {/* ── Allocate Modal ── */}
      {allocModal && (() => {
        const selLT       = leaveTypes.find(t => t._id === allocForm.leaveTypeId);
        const isMonthly   = !!selLT?.monthlyAccrual?.enabled;
        const proratedDays = computeProration(selLT?.annualAllocation || 0, activeAY);
        const isMidYear   = proratedDays !== selLT?.annualAllocation && proratedDays !== 0;
        const computedDays = allocForm.overrideDays !== ''
          ? Number(allocForm.overrideDays)
          : isMonthly && !allocForm.giveFullAllocation
            ? 0
            : allocForm.useProration && !isMonthly
              ? proratedDays
              : (selLT?.annualAllocation || 0);
        const teacherCount = allocForm.teacherMode === 'all'
          ? teacherList.length
          : allocForm.teacherMode === 'except'
            ? teacherList.length - allocForm.checkedTeachers.length
            : allocForm.checkedTeachers.length;

        return (
          <Modal open={allocModal} onClose={() => setAllocModal(false)} title="Allocate Leave" maxWidth={600}
            footer={<>
              <Button variant="secondary" onClick={() => setAllocModal(false)}>Cancel</Button>
              <Button form="alloc-form" type="submit" loading={allocLoad}>Allocate</Button>
            </>}>
            <form id="alloc-form" onSubmit={handleAllocate}>

              {/* Leave Type */}
              <div className="form-group">
                <label className="form-label required">Leave Type</label>
                <select className="form-control" required value={allocForm.leaveTypeId}
                  onChange={e => setAllocForm(f => ({ ...f, leaveTypeId: e.target.value, giveFullAllocation: true, useProration: false, overrideDays: '' }))}>
                  <option value="">Select type…</option>
                  {leaveTypes.filter(t => t.isActive).map(t => (
                    <option key={t._id} value={t._id}>{t.name} ({t.code}) — {t.annualAllocation} days/yr{t.monthlyAccrual?.enabled ? ' · monthly' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Teacher Selection */}
              <div className="form-group">
                <label className="form-label">Teachers</label>

                {/* 3 mode radios */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                  {[
                    ['all',    'All Teachers'],
                    ['select', 'Select Specific'],
                    ['except', 'Except Specific'],
                  ].map(([val, label]) => (
                    <label key={val} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" name="teacherMode" value={val}
                        checked={allocForm.teacherMode === val}
                        onChange={() => setAllocForm(f => ({ ...f, teacherMode: val, checkedTeachers: [] }))} />
                      {label}
                    </label>
                  ))}
                </div>

                {/* All Teachers — no list, just a count badge */}
                {allocForm.teacherMode === 'all' && (
                  <div style={{ padding: '8px 12px', background: 'var(--bg-muted)', borderRadius: 6, fontSize: '.85rem', color: 'var(--text-muted)' }}>
                    All <strong style={{ color: 'var(--text)' }}>{teacherList.length}</strong> active teacher(s) will be allocated.
                  </div>
                )}

                {/* Select Specific / Except Specific — same checklist UI, different semantics */}
                {(allocForm.teacherMode === 'select' || allocForm.teacherMode === 'except') && (
                  <div>
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: '.82rem' }}>
                        <input type="checkbox"
                          checked={allocForm.checkedTeachers.length === teacherList.length && teacherList.length > 0}
                          onChange={e => setAllocForm(f => ({ ...f, checkedTeachers: e.target.checked ? teacherList.map(t => t._id) : [] }))} />
                        <strong>
                          {allocForm.teacherMode === 'select' ? `Select All (${teacherList.length})` : `Exclude All (${teacherList.length})`}
                        </strong>
                        {allocForm.checkedTeachers.length > 0 && (
                          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                            — {allocForm.checkedTeachers.length} selected
                          </span>
                        )}
                      </label>
                    </div>
                    <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 0' }}>
                      {teacherList.map(t => (
                        <label key={t._id} style={{ display: 'flex', gap: 8, padding: '5px 10px', cursor: 'pointer', alignItems: 'center' }}>
                          <input type="checkbox" checked={allocForm.checkedTeachers.includes(t._id)}
                            onChange={e => {
                              const ids = e.target.checked
                                ? [...allocForm.checkedTeachers, t._id]
                                : allocForm.checkedTeachers.filter(id => id !== t._id);
                              setAllocForm(f => ({ ...f, checkedTeachers: ids }));
                            }} />
                          <span>{t.name}</span>
                          {t.employeeId && <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>({t.employeeId})</span>}
                        </label>
                      ))}
                    </div>
                    {allocForm.teacherMode === 'except' && allocForm.checkedTeachers.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: '.8rem', color: 'var(--text-muted)' }}>
                        {teacherList.length - allocForm.checkedTeachers.length} teacher(s) will be allocated (excluding {allocForm.checkedTeachers.length}).
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Allocation Amount */}
              {selLT && (
                <div className="form-group">
                  <label className="form-label">Allocation</label>
                  <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '8px 12px', fontSize: '.82rem', marginBottom: 10 }}>
                    <strong>{selLT.name}</strong> — {selLT.annualAllocation} days/year
                    {isMonthly && <span style={{ color: 'var(--primary)', marginLeft: 8 }}>
                      Monthly accrual ({selLT.monthlyAccrual.daysPerMonth}/month)
                    </span>}
                  </div>

                  {isMonthly ? (
                    <div style={{ display: 'flex', gap: 20, marginBottom: 8, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="radio" checked={!allocForm.giveFullAllocation}
                          onChange={() => setAllocForm(f => ({ ...f, giveFullAllocation: false, overrideDays: '' }))} />
                        <span>Start at 0 <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>(auto-credit {selLT.monthlyAccrual.daysPerMonth}/month)</span></span>
                      </label>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="radio" checked={allocForm.giveFullAllocation}
                          onChange={() => setAllocForm(f => ({ ...f, giveFullAllocation: true, overrideDays: '' }))} />
                        <span>Give all {selLT.annualAllocation} days now</span>
                      </label>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 20, marginBottom: 8, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="radio" checked={!allocForm.useProration && allocForm.overrideDays === ''}
                          onChange={() => setAllocForm(f => ({ ...f, useProration: false, overrideDays: '' }))} />
                        <span>Full ({selLT.annualAllocation} days)</span>
                      </label>
                      {isMidYear && (
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                          <input type="radio" checked={allocForm.useProration && allocForm.overrideDays === ''}
                            onChange={() => setAllocForm(f => ({ ...f, useProration: true, overrideDays: '' }))} />
                          <span>Prorated ({proratedDays} days <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>based on remaining months</span>)</span>
                        </label>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: '.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Custom override:</span>
                    <input type="number" className="form-control" style={{ width: 110 }} min="0"
                      value={allocForm.overrideDays}
                      placeholder={String(computedDays)}
                      onChange={e => setAllocForm(f => ({ ...f, overrideDays: e.target.value, useProration: false, giveFullAllocation: true }))} />
                    {allocForm.overrideDays !== '' && (
                      <button type="button" className="btn btn-secondary btn-sm"
                        onClick={() => setAllocForm(f => ({ ...f, overrideDays: '' }))}>Clear</button>
                    )}
                  </div>

                  <div style={{ marginTop: 12, padding: '8px 14px', background: 'var(--primary)', color: '#fff', borderRadius: 4, fontSize: '.85rem' }}>
                    Will allocate <strong>{computedDays}</strong> day(s) to <strong>{teacherCount}</strong> teacher(s)
                  </div>
                </div>
              )}

            </form>
          </Modal>
        );
      })()}

      {/* ── Allocation Import Modal ── */}
      <Modal open={allocImportModal} onClose={() => setAllocImportModal(false)} title="Import Leave Allocations"
        footer={<Button variant="secondary" onClick={() => setAllocImportModal(false)}>Close</Button>}>
        <input ref={allocFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleBulkImport} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: '.88rem', color: 'var(--text-muted)' }}>
            Download the template, fill in allocations per teacher and leave type, then upload the completed file.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: '1.4rem' }}>📄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '.88rem' }}>Allocation Template</div>
              <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Excel with all teachers × leave types pre-filled</div>
            </div>
            <Button variant="secondary" onClick={handleDownloadTemplate}>⬇ Download</Button>
          </div>
          <div
            onClick={() => !importLoad && allocFileRef.current?.click()}
            style={{
              border: '2px dashed var(--border)', borderRadius: 8, padding: '28px 20px',
              textAlign: 'center', cursor: importLoad ? 'default' : 'pointer',
              background: 'var(--bg-muted)', transition: 'border-color .15s',
            }}
            onMouseEnter={e => { if (!importLoad) e.currentTarget.style.borderColor = 'var(--primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>⬆️</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {importLoad ? 'Importing…' : 'Click to upload .xlsx file'}
            </div>
            <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Supports .xlsx, .xls</div>
            {importLoad && <div style={{ marginTop: 10 }}><Spinner /></div>}
          </div>
        </div>
      </Modal>

      {/* ── Allocation / Balance Detail Modal ── */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)}
        title={`Leave Details — ${detailModal?.teacher?.name || ''}`} maxWidth={720}
        footer={<Button variant="secondary" onClick={() => setDetailModal(null)}>Close</Button>}>
        {detailModal && (
          <div>
            <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 6 }}>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>{detailModal.teacher?.name}</div>
              <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {detailModal.teacher?.email}
                {detailModal.teacher?.employeeId && ` · ID: ${detailModal.teacher.employeeId}`}
                {detailModal.ay && ` · Year: ${detailModal.ay}`}
              </div>
            </div>
            <Table
              columns={[
                { key: 'type',      label: 'Leave Type', render: b => <strong>{b.leaveType?.name || '—'}</strong> },
                { key: 'code',      label: 'Code',       render: b => <code style={{ background: 'var(--bg-muted)', padding: '2px 6px', borderRadius: 4 }}>{b.leaveType?.code}</code> },
                { key: 'allocated', label: 'Allocated',  render: b => b.totalAllocated || 0 },
                { key: 'cf',        label: 'Carry Fwd',  render: b => b.carriedForward || 0 },
                { key: 'used',      label: 'Used',       render: b => b.used || 0 },
                { key: 'pending',   label: 'Pending',    render: b => b.pending || 0 },
                { key: 'remaining', label: 'Remaining',  render: b => {
                  const rem = Math.max(0, (b.totalAllocated||0)+(b.carriedForward||0)-(b.used||0)-(b.pending||0));
                  return <strong style={{ color: rem > 0 ? 'var(--success)' : 'var(--danger)' }}>{rem}</strong>;
                }},
              ]}
              data={detailModal.balances}
            />
          </div>
        )}
      </Modal>

      {/* ── Report Applications Detail Modal ── */}
      <Modal open={!!repDetailModal} onClose={() => setRepDetailModal(null)}
        title={`Applications — ${repDetailModal?.teacher?.name || ''}`} maxWidth={820}
        footer={<Button variant="secondary" onClick={() => setRepDetailModal(null)}>Close</Button>}>
        {repDetailModal && (
          <Table
            columns={[
              { key: 'type',    label: 'Type',       render: r => r.leaveType?.name || '—' },
              { key: 'dates',   label: 'Period',     render: r => `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}` },
              { key: 'days',    label: 'Days',       render: r => r.totalDays },
              { key: 'mode',    label: 'Mode',       render: r => r.leaveMode?.replace('_', ' ') },
              { key: 'status',  label: 'Status',     render: r => <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status?.replace('_', ' ')}</Badge> },
              { key: 'reason',  label: 'Reason',     render: r => <span style={{ fontSize: '.82rem' }}>{r.reason || '—'}</span> },
              { key: 'comment', label: 'Admin Note', render: r => r.adminComment ? <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{r.adminComment}</span> : '—' },
              { key: 'applied', label: 'Applied On', render: r => fmtDate(r.appliedAt) },
              { key: 'doc',     label: 'Doc',        render: r => r.document ? <a href={`/uploads/leave-docs/${r.document}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>📎 View</a> : '—' },
            ]}
            data={repDetailModal.apps}
          />
        )}
      </Modal>

      {/* ── Carry Forward Modal ── */}
      <Modal open={cfModal} onClose={() => setCfModal(false)} title="Run Carry-Forward"
        footer={<>
          <Button variant="secondary" onClick={() => setCfModal(false)}>Cancel</Button>
          <Button form="cf-form" type="submit" loading={cfLoad}>Run</Button>
        </>}>
        <form id="cf-form" onSubmit={handleCarryForward}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
            Carry forward unused leave from one academic year to the next (for eligible leave types).
          </p>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label required">From Year</label>
              <input type="text" className="form-control" required value={cfForm.fromYear}
                onChange={e => setCfForm(f => ({ ...f, fromYear: e.target.value }))} placeholder="e.g. 2024-25" />
            </div>
            <div className="form-group">
              <label className="form-label required">To Year</label>
              <input type="text" className="form-control" required value={cfForm.toYear}
                onChange={e => setCfForm(f => ({ ...f, toYear: e.target.value }))} placeholder="e.g. 2025-26" />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
