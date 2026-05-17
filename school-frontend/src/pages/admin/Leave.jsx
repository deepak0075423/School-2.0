import React, { useState, useRef } from 'react';
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
  name: '', code: '', annualAllocation: 12, monthlyAccrual: { enabled: false, daysPerMonth: 0 },
  carryForward: { enabled: false, maxDays: 0 }, encashable: false,
  maxConsecutiveDays: 0, requiresDocument: false, documentRequiredAfterDays: 0, isActive: true,
};

const EMPTY_APPLY = { teacherId: '', leaveTypeId: '', fromDate: '', toDate: '', leaveMode: 'full_day', reason: '' };
const EMPTY_ALLOC = { teacherId: '', leaveTypeId: '', totalAllocated: '' };

function downloadBuffer(data, filename) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminLeave() {
  const [tab, setTab] = useState('requests');

  // ── Requests ─────────────────────────────────────────────────────────────────
  const [reqPage,   setReqPage]   = useState(1);
  const [reqStatus, setReqStatus] = useState('');
  const [actionModal, setActionModal] = useState(null); // { type, request }
  const [comment,   setComment]   = useState('');
  const [actLoad,   setActLoad]   = useState(false);

  const { data: reqData, loading: reqLoading, refetch: refetchReq } = useFetch(
    () => api.getLeaveRequests({ page: reqPage, limit: 20, status: reqStatus || undefined }),
    [reqPage, reqStatus],
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
  const { data: ltData } = useFetch(api.getLeaveTypes);
  const leaveTypes = ltData?.data || [];

  const handleApply = async (e) => {
    e.preventDefault();
    setApplyLoad(true);
    try {
      await api.adminApplyLeave(applyForm);
      toast.success('Leave applied');
      setApplyModal(false); setApplyForm(EMPTY_APPLY);
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

  const openCreateType = () => { setTypeForm(EMPTY_TYPE); setEditType(null); setTypeModal(true); };
  const openEditType   = (t) => {
    setTypeForm({
      name: t.name, code: t.code, annualAllocation: t.annualAllocation,
      monthlyAccrual:            t.monthlyAccrual           || { enabled: false, daysPerMonth: 0 },
      carryForward:              t.carryForward             || { enabled: false, maxDays: 0 },
      encashable:                !!t.encashable,
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
      toast.success(editType ? 'Leave type updated' : 'Leave type created');
      setTypeModal(false); refetchTypes();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
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
  const [cfModal,     setCfModal]     = useState(false);
  const [cfForm,      setCfForm]      = useState({ fromYear: '', toYear: '' });
  const [cfLoad,      setCfLoad]      = useState(false);
  const [importLoad,  setImportLoad]  = useState(false);
  const allocFileRef  = useRef();
  const { data: allocData, refetch: refetchAlloc } = useFetch(api.getLeaveAllocations);
  const allocations = allocData?.data || [];

  const handleAllocate = async (e) => {
    e.preventDefault();
    setAllocLoad(true);
    try {
      await api.allocateLeave(allocForm);
      toast.success('Leave allocated');
      setAllocModal(false); setAllocForm(EMPTY_ALLOC); refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setAllocLoad(false); }
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
      toast.success(`Imported. Updated: ${res?.data?.updated ?? 0}${res?.data?.errors?.length ? `, Errors: ${res.data.errors.length}` : ''}`);
      refetchAlloc();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setImportLoad(false); e.target.value = ''; }
  };

  const allocColumns = [
    { key: 'teacher',   label: 'Teacher',    render: a => <div><div style={{ fontWeight: 600 }}>{a.teacher?.name || '—'}</div><div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{a.teacher?.employeeId || ''}</div></div> },
    { key: 'type',      label: 'Leave Type', render: a => a.leaveType?.name || '—' },
    { key: 'allocated', label: 'Allocated',  render: a => a.totalAllocated },
    { key: 'cf',        label: 'Carried Fwd',render: a => a.carriedForward || 0 },
    { key: 'used',      label: 'Used',       render: a => a.used || 0 },
    { key: 'pending',   label: 'Pending',    render: a => a.pending || 0 },
    { key: 'remaining', label: 'Remaining',  render: a => Math.max(0, (a.totalAllocated || 0) + (a.carriedForward || 0) - (a.used || 0) - (a.pending || 0)) },
    { key: 'ay',        label: 'Year',       render: a => a.academicYear || '—' },
  ];

  // ── Reports ───────────────────────────────────────────────────────────────────
  const [repStatus, setRepStatus] = useState('');
  const [exportLoad, setExportLoad] = useState(false);
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

  const repColumns = [
    { key: 'teacher',  label: 'Teacher',   render: r => r.teacher?.name || '—' },
    { key: 'type',     label: 'Type',      render: r => r.leaveType?.name || '—' },
    { key: 'dates',    label: 'Period',    render: r => `${fmtDate(r.fromDate)} – ${fmtDate(r.toDate)}` },
    { key: 'days',     label: 'Days',      render: r => r.totalDays },
    { key: 'mode',     label: 'Mode',      render: r => r.leaveMode?.replace('_', ' ') },
    { key: 'status',   label: 'Status',    render: r => <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status?.replace('_', ' ')}</Badge> },
    { key: 'applied',  label: 'Applied On',render: r => fmtDate(r.appliedAt) },
  ];

  const summaryColumns = [
    { key: 'teacher',   label: 'Teacher',    render: s => s.teacher?.name || '—' },
    { key: 'type',      label: 'Leave Type', render: s => s.leaveType?.name || '—' },
    { key: 'ay',        label: 'Year',       render: s => s.academicYear },
    { key: 'allocated', label: 'Allocated',  render: s => s.totalAllocated },
    { key: 'used',      label: 'Used',       render: s => s.used },
    { key: 'pending',   label: 'Pending',    render: s => s.pending },
    { key: 'remaining', label: 'Remaining',  render: s => <strong style={{ color: s.remaining > 0 ? 'var(--success)' : 'var(--danger)' }}>{s.remaining}</strong> },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <PageHeader title="Leave Management" subtitle="Manage leave types, requests, and allocations"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'requests' && <Button onClick={() => { setApplyForm(EMPTY_APPLY); setApplyModal(true); }}>+ Apply Leave</Button>}
            {tab === 'types'    && <Button onClick={openCreateType}>+ Add Type</Button>}
            {tab === 'allocations' && (
              <>
                <Button variant="secondary" onClick={handleDownloadTemplate}>Template</Button>
                <Button variant="secondary" onClick={() => allocFileRef.current?.click()} loading={importLoad}>Import Excel</Button>
                <Button variant="secondary" onClick={() => setCfModal(true)}>Carry Forward</Button>
                <Button onClick={() => { setAllocForm(EMPTY_ALLOC); setAllocModal(true); }}>+ Allocate</Button>
                <input ref={allocFileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleBulkImport} />
              </>
            )}
            {tab === 'reports' && <Button onClick={handleExport} loading={exportLoad}>Export Excel</Button>}
          </div>
        }
      />

      <div className="tabs">
        {[['requests','Requests'],['types','Leave Types'],['allocations','Allocations'],['reports','Reports']].map(([key, label]) => (
          <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* ── Requests ── */}
      {tab === 'requests' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ width: 160 }} value={reqStatus} onChange={e => { setReqStatus(e.target.value); setReqPage(1); }}>
              <option value="">All Statuses</option>
              {['pending','approved','rejected','cancelled','modification_requested'].map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {reqLoading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
              : <Table columns={reqColumns} data={reqData?.data} emptyIcon="🏖️" emptyTitle="No leave requests" />}
          </div>
          {reqData && (
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
            <Table columns={typeColumns} data={typesData?.data} emptyIcon="📋" emptyTitle="No leave types yet" />
          </div>
        </div>
      )}

      {/* ── Allocations ── */}
      {tab === 'allocations' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <Table columns={allocColumns} data={allocations} emptyIcon="📊" emptyTitle="No allocations found" />
          </div>
        </div>
      )}

      {/* ── Reports ── */}
      {tab === 'reports' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="form-control" style={{ width: 160 }} value={repStatus} onChange={e => setRepStatus(e.target.value)}>
                <option value="">All Statuses</option>
                {['pending','approved','rejected','cancelled'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {repLoading ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
                : <Table columns={repColumns} data={repData?.data?.applications} emptyIcon="📄" emptyTitle="No applications" />}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><h3 style={{ margin: 0, fontSize: '1rem' }}>Balance Summary</h3></div>
            <div className="card-body" style={{ padding: 0 }}>
              <Table columns={summaryColumns} data={repData?.data?.summary} emptyIcon="📊" emptyTitle="No balance data" />
            </div>
          </div>
        </>
      )}

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
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={typeForm.encashable || false}
                onChange={e => setTypeForm(f => ({ ...f, encashable: e.target.checked }))} />
              Encashable
            </label>
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
      <Modal open={allocModal} onClose={() => setAllocModal(false)} title="Allocate Leave"
        footer={<>
          <Button variant="secondary" onClick={() => setAllocModal(false)}>Cancel</Button>
          <Button form="alloc-form" type="submit" loading={allocLoad}>Allocate</Button>
        </>}>
        <form id="alloc-form" onSubmit={handleAllocate}>
          <div className="form-group">
            <label className="form-label required">Teacher</label>
            <select className="form-control" required value={allocForm.teacherId}
              onChange={e => setAllocForm(f => ({ ...f, teacherId: e.target.value }))}>
              <option value="">Select teacher…</option>
              {teacherList.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Leave Type</label>
            <select className="form-control" required value={allocForm.leaveTypeId}
              onChange={e => setAllocForm(f => ({ ...f, leaveTypeId: e.target.value }))}>
              <option value="">Select type…</option>
              {leaveTypes.map(t => <option key={t._id} value={t._id}>{t.name} ({t.code})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Days Allocated</label>
            <input type="number" className="form-control" required min={0} value={allocForm.totalAllocated}
              onChange={e => setAllocForm(f => ({ ...f, totalAllocated: e.target.value }))} />
          </div>
        </form>
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
