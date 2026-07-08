import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/teacher.api';
import { useAuth } from '../../../contexts/AuthContext';
import { PageHeader, Badge, Button, Spinner, Alert } from '../../../components/ui/index';

export default function TeacherExamApproval() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: exam, loading, refetch } = useFetch(() => api.getResultApproval(id), [id]);

  const [busy, setBusy]           = useState(false);
  const [publishDate, setPubDate] = useState('');
  const [reason, setReason]       = useState('');

  if (loading) return <div className="loading-page"><Spinner /></div>;
  if (!exam) return null;

  const isCreator     = String(exam.createdBy?._id || exam.createdBy) === String(user?._id);
  const step1Approved = exam.subjectTeacherApprovalStatus === 'approved';
  const step2Status   = exam.resultApprovalStatus || 'pending';

  const doSubjectApprove = async () => {
    setBusy(true);
    try { await api.subjectApproveResults(id); toast.success('Results approved (step 1)'); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const doFinal = async (action) => {
    if (action === 'reject' && !reason.trim()) return toast.error('Provide a rejection reason');
    setBusy(true);
    try {
      await api.approveResults(id, { action, reason, resultPublishDate: publishDate || undefined });
      toast.success(action === 'approve' ? 'Results published to students' : 'Results rejected');
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <PageHeader title={`Result Approval — ${exam.title}`}
        subtitle="Two-step approval: subject teacher → class teacher"
        action={<Button variant="secondary" onClick={() => navigate('/teacher/exams')}>← Back</Button>} />

      {exam.status !== 'completed' && (
        <Alert variant="warning">This exam is not completed yet — approval opens once all students have submitted.</Alert>
      )}

      {/* Step 1 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <strong>Step 1 — Subject teacher approval</strong>
              <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {step1Approved
                  ? `Approved by ${exam.subjectTeacherApprovedBy?.name || '—'} on ${exam.subjectTeacherApprovedAt ? new Date(exam.subjectTeacherApprovedAt).toLocaleString('en-IN') : ''}`
                  : 'The exam creator confirms scores are correct.'}
              </div>
            </div>
            {step1Approved
              ? <Badge variant="success">approved</Badge>
              : isCreator && exam.status === 'completed'
                ? <Button loading={busy} onClick={doSubjectApprove}>Approve results</Button>
                : <Badge variant="warning">pending</Badge>}
          </div>
        </div>
      </div>

      {/* Step 2 */}
      <div className="card">
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <strong>Step 2 — Final approval & publish</strong>
              <div style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
                {step2Status === 'approved'
                  ? `Approved by ${exam.resultApprovedBy?.name || '—'}${exam.resultPublishDate ? ` · publish date ${new Date(exam.resultPublishDate).toLocaleDateString('en-IN')}` : ''}`
                  : step2Status === 'rejected'
                    ? `Rejected — ${exam.resultRejectionReason || 'no reason given'}`
                    : 'Publishes results to students (optionally on a scheduled date).'}
              </div>
            </div>
            <Badge variant={step2Status === 'approved' ? 'success' : step2Status === 'rejected' ? 'danger' : 'warning'}>{step2Status}</Badge>
          </div>

          {step1Approved && step2Status === 'pending' && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">Result publish date (optional)</label>
                  <input type="date" className="form-control" value={publishDate} onChange={e => setPubDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Rejection reason (if rejecting)</label>
                  <input className="form-control" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are results being rejected?" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button loading={busy} onClick={() => doFinal('approve')}>✓ Approve & publish</Button>
                <Button variant="danger" loading={busy} onClick={() => doFinal('reject')}>✗ Reject</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
