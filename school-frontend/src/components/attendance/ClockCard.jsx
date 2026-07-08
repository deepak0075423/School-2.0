import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { Button, Spinner } from '../ui/index';

/**
 * Self-contained "today" clock in/out card.
 * Used standalone on dashboards and at the top of the My Attendance tab.
 *
 * props:
 *   api:       { getMyAttendance({month,year}), clockIn(), clockOut() }
 *   linkTo:    optional path to the full attendance page (shown as a link)
 *   onChanged: optional callback fired after a successful clock action
 */
export default function ClockCard({ api, linkTo, onChanged }) {
  const now = new Date();
  const [busy, setBusy] = useState(false);

  const { data, loading, refetch } = useFetch(
    () => api.getMyAttendance({ month: now.getMonth() + 1, year: now.getFullYear() }),
    [],
  );
  const today = data?.today;

  const act = async (fn, label) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(`${label} at ${res.data?.[label === 'Clocked in' ? 'checkIn' : 'checkOut']}`);
      refetch();
      onChanged?.();
    } catch (err) { toast.error(err?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner /></div>
      </div>
    );
  }
  if (!today) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '2rem' }}>🕐</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700 }}>
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
            {today.onLeave
              ? <>You are on approved leave today ({today.leaveLabel}) — no need to clock in.</>
              : today.clockedIn
                ? <>Clocked in at <strong>{today.checkIn}</strong>{today.checkOut && <> · out at <strong>{today.checkOut}</strong></>}</>
                : 'Not clocked in yet — unmarked days count as absent.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!today.onLeave && (
            !today.clockedIn
              ? <Button loading={busy} onClick={() => act(api.clockIn, 'Clocked in')}>▶ Clock In</Button>
              : <Button variant={today.clockedOut ? 'secondary' : 'primary'} loading={busy}
                  onClick={() => act(api.clockOut, 'Clocked out')}>
                  {today.clockedOut ? '↻ Update Clock Out' : '■ Clock Out'}
                </Button>
          )}
          {linkTo && (
            <Link to={linkTo} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>Calendar →</Link>
          )}
        </div>
      </div>
    </div>
  );
}
