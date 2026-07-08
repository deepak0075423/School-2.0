import React, { useState } from 'react';

// ── Spinner ────────────────────────────────────────────────────────────────────
export const Spinner = ({ size = '' }) => (
  <div className={`spinner${size === 'sm' ? ' spinner-sm' : ''}`} />
);

// ── Button ────────────────────────────────────────────────────────────────────
export const Button = ({ children, variant = 'primary', size, loading, ...props }) => (
  <button
    className={`btn btn-${variant}${size ? ` btn-${size}` : ''}`}
    disabled={loading || props.disabled}
    {...props}
  >
    {loading ? <Spinner size="sm" /> : null}
    {children}
  </button>
);

// ── Input ─────────────────────────────────────────────────────────────────────
export const Input = React.forwardRef(({ label, error, hint, required, ...props }, ref) => (
  <div className="form-group">
    {label && <label className={`form-label${required ? ' required' : ''}`}>{label}</label>}
    <input ref={ref} className={`form-control${error ? ' error' : ''}`} {...props} />
    {hint  && <div className="form-hint">{hint}</div>}
    {error && <div className="form-error">{error}</div>}
  </div>
));

// ── Select ────────────────────────────────────────────────────────────────────
export const Select = React.forwardRef(({ label, error, required, children, ...props }, ref) => (
  <div className="form-group">
    {label && <label className={`form-label${required ? ' required' : ''}`}>{label}</label>}
    <select ref={ref} className={`form-control${error ? ' error' : ''}`} {...props}>
      {children}
    </select>
    {error && <div className="form-error">{error}</div>}
  </div>
));

// ── Textarea ──────────────────────────────────────────────────────────────────
export const Textarea = React.forwardRef(({ label, error, required, ...props }, ref) => (
  <div className="form-group">
    {label && <label className={`form-label${required ? ' required' : ''}`}>{label}</label>}
    <textarea ref={ref} className={`form-control${error ? ' error' : ''}`} rows={4} {...props} />
    {error && <div className="form-error">{error}</div>}
  </div>
));

// ── Card ──────────────────────────────────────────────────────────────────────
export const Card = ({ title, action, children, footer }) => (
  <div className="card">
    {title && (
      <div className="card-header">
        <h2>{title}</h2>
        {action}
      </div>
    )}
    <div className="card-body">{children}</div>
    {footer && <div className="card-footer">{footer}</div>}
  </div>
);

// ── Badge ─────────────────────────────────────────────────────────────────────
export const Badge = ({ children, variant = 'primary' }) => (
  <span className={`badge badge-${variant}`}>{children}</span>
);

// ── Modal ─────────────────────────────────────────────────────────────────────
export const Modal = ({ open, onClose, title, children, footer, maxWidth = 560 }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

// ── Confirm Dialog ────────────────────────────────────────────────────────────
export const Confirm = ({ open, onClose, onConfirm, title, message, loading }) => (
  <Modal open={open} onClose={onClose} title={title || 'Confirm'} maxWidth={440}
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>Confirm</Button>
      </>
    }>
    <p style={{ color: 'var(--text-muted)' }}>{message || 'Are you sure?'}</p>
  </Modal>
);

// ── Empty State ───────────────────────────────────────────────────────────────
export const Empty = ({ icon = '📭', title = 'No data', message, action }) => (
  <div className="empty-state">
    <div className="empty-state__icon">{icon}</div>
    <h3>{title}</h3>
    {message && <p>{message}</p>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>
);

// ── Table ─────────────────────────────────────────────────────────────────────
export const Table = ({ columns, data, loading, emptyIcon, emptyTitle }) => {
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <Spinner />
    </div>
  );
  if (!data?.length) return <Empty icon={emptyIcon} title={emptyTitle || 'No records'} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={row._id || i}>
              {columns.map(c => (
                <td key={c.key}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Pagination ────────────────────────────────────────────────────────────────
export const Pagination = ({ page, pages, total, onPage }) => {
  if (pages <= 1) return null;
  const nums = Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
      <span className="text-muted text-sm">{total} total records</span>
      <div className="pagination">
        <button className="pagination__btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        {nums.map(n => (
          <button key={n} className={`pagination__btn${n === page ? ' active' : ''}`} onClick={() => onPage(n)}>{n}</button>
        ))}
        <button className="pagination__btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
      </div>
    </div>
  );
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
export const StatCard = ({ icon, label, value, color = 'blue', change }) => (
  <div className="stat-card">
    <div className={`stat-card__icon ${color}`}>{icon}</div>
    <div className="stat-card__info">
      <div className="stat-card__value">{value ?? '—'}</div>
      <div className="stat-card__label">{label}</div>
      {change && (
        <div className={`stat-card__change ${change > 0 ? 'up' : 'down'}`}>
          {change > 0 ? '↑' : '↓'} {Math.abs(change)}%
        </div>
      )}
    </div>
  </div>
);

// ── Page Header ───────────────────────────────────────────────────────────────
export const PageHeader = ({ title, subtitle, action }) => (
  <div className="page-header">
    <div>
      <h1>{title}</h1>
      {subtitle && <p className="text-muted">{subtitle}</p>}
    </div>
    {action}
  </div>
);

// ── Alert ─────────────────────────────────────────────────────────────────────
export const Alert = ({ variant = 'info', children }) => (
  <div className={`alert alert-${variant}`}>{children}</div>
);

// ── MiniCalendar ──────────────────────────────────────────────────────────────
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

const CAL_DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Always use local date parts to avoid UTC-offset shifts
function localIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Convert a UTC-midnight date string (from server) to a local-midnight Date
function parseServerDate(isoStr) {
  const d = new Date(isoStr);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function buildGrid(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  let dow = first.getDay();
  dow = dow === 0 ? 6 : dow - 1;
  const cells = [];
  for (let i = 0; i < dow; i++)
    cells.push({ date: new Date(year, month, -dow + i + 1), cur: false });
  for (let d = 1; d <= last.getDate(); d++)
    cells.push({ date: new Date(year, month, d), cur: true });
  const rem = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= rem; i++)
    cells.push({ date: new Date(year, month + 1, i), cur: false });
  return cells;
}

// Returns true if this date is an off day (Sunday always; Saturday based on config)
function isWeekendOff(date, satConfig) {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  if (dow === 0) return true;                          // Sunday always off
  if (dow !== 6) return false;                         // Mon-Fri never off here
  if (!satConfig || satConfig.working == null) return false; // no config → assume working
  if (satConfig.working === false) return true;        // all saturdays off
  if (!satConfig.mode || satConfig.mode === 'all') return false; // all on
  const nth = Math.ceil(date.getDate() / 7);           // nth occurrence in month
  if (satConfig.mode === '1_3_5') return nth % 2 === 0; // 2nd & 4th are off
  if (satConfig.mode === '2_4')   return nth % 2 === 1; // 1st, 3rd & 5th are off
  return false;
}

export function MiniCalendar({ holidays = [], leaves = [], attendance = [], holidayListPath = '', saturdayConfig }) {
  const today        = new Date();
  const todayIso     = localIso(today);
  const [view, setView] = React.useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const yr  = view.getFullYear();
  const mon = view.getMonth();
  const isCurrentMonth = yr === today.getFullYear() && mon === today.getMonth();
  const cells = useMemo(() => buildGrid(yr, mon), [yr, mon]);

  // Build a map: "YYYY-MM-DD" → [holiday, ...] using local midnight dates
  const holidayMap = useMemo(() => {
    const map = {};
    holidays.forEach(h => {
      if (!h.startDate) return;
      const cur = parseServerDate(h.startDate);
      const end = parseServerDate(h.endDate || h.startDate);
      while (cur <= end) {
        const k = localIso(cur);
        (map[k] = map[k] || []).push(h);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [holidays]);

  // Attendance map: "YYYY-MM-DD" → 'present' | 'absent' (self clock in/out days)
  const attMap = useMemo(() => {
    const map = {};
    attendance.forEach(a => {
      if (!a?.date || !['present', 'absent'].includes(a.status)) return;
      map[localIso(parseServerDate(a.date))] = a.status;
    });
    return map;
  }, [attendance]);

  // Build leave map: "YYYY-MM-DD" → [leave, ...]
  const leaveMap = useMemo(() => {
    const map = {};
    leaves.forEach(l => {
      if (!l.fromDate) return;
      const cur = parseServerDate(l.fromDate);
      const end = parseServerDate(l.toDate || l.fromDate);
      while (cur <= end) {
        const k = localIso(cur);
        (map[k] = map[k] || []).push(l);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [leaves]);

  const monthHolidays = useMemo(() => {
    const monthStr = `${yr}-${String(mon + 1).padStart(2, '0')}`;
    const seen = new Set();
    const result = [];
    Object.entries(holidayMap).forEach(([iso, hs]) => {
      if (!iso.startsWith(monthStr)) return;
      hs.forEach(h => { if (!seen.has(h._id || h.name)) { seen.add(h._id || h.name); result.push(h); } });
    });
    result.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    return result;
  }, [holidayMap, yr, mon]);

  const goToday = () => setView(new Date(today.getFullYear(), today.getMonth(), 1));

  return (
    <div className="card">
      <div className="card-body" style={{ padding: '16px 18px' }}>

        {/* Month navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button
            onClick={() => setView(new Date(yr, mon - 1, 1))}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', fontSize: '.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ‹
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <strong style={{ fontSize: '.92rem' }}>{CAL_MONTHS[mon]} {yr}</strong>
            {!isCurrentMonth && (
              <button onClick={goToday} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '.7rem',
                color: 'var(--primary)', padding: '0 4px', fontWeight: 600, lineHeight: 1,
              }}>
                Today
              </button>
            )}
          </div>
          <button
            onClick={() => setView(new Date(yr, mon + 1, 1))}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', fontSize: '.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ›
          </button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
          {CAL_DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)', padding: '3px 0' }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((cell, i) => {
            const iso       = localIso(cell.date);
            const isToday   = iso === todayIso;
            const dayHols   = holidayMap[iso] || [];
            const dayLeaves = leaveMap[iso]   || [];
            const isHol     = dayHols.length > 0   && cell.cur;
            const isLeave   = dayLeaves.length > 0 && cell.cur;
            const att       = cell.cur ? attMap[iso] : null;
            const isOff     = cell.cur && !isToday && isWeekendOff(cell.date, saturdayConfig);
            const tipParts  = [
              ...(att ? [att === 'present' ? 'Present' : 'Absent'] : []),
              ...(isOff && !isHol ? [cell.date.getDay() === 0 ? 'Sunday' : 'Holiday'] : []),
              ...dayHols.map(h => h.name),
              ...dayLeaves.map(l => `${l.leaveType?.code || 'Leave'} (${l.status})`),
            ];
            const bg = isToday           ? 'var(--primary)'
                     : att === 'present' ? 'rgba(16,185,129,.18)'
                     : att === 'absent'  ? 'rgba(239,68,68,.18)'
                     : isLeave           ? 'rgba(180,83,9,.13)'
                     : isHol             ? '#fef3c7'
                     : isOff             ? 'rgba(0,0,0,.05)'
                     : 'transparent';
            return (
              <div key={i}
                title={tipParts.join(' • ')}
                style={{
                  minHeight: 32, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'flex-start', padding: '3px 1px',
                  borderRadius: 5, background: bg,
                }}>
                <span style={{
                  fontSize: '.78rem', fontWeight: isToday ? 700 : 400, lineHeight: 1,
                  color: isToday ? '#fff' : (isOff && !isHol && !isLeave) ? 'var(--text-muted)' : cell.cur ? 'var(--text)' : 'var(--text-muted)',
                  opacity: cell.cur ? 1 : 0.35,
                }}>
                  {cell.date.getDate()}
                </span>
                <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                  {att === 'present' && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981' }} />}
                  {att === 'absent'  && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />}
                  {isHol   && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#d97706' }} />}
                  {isLeave && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#b45309' }} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Monthly holidays list */}
        {monthHolidays.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            {monthHolidays.slice(0, 4).map((h, i) => {
              const start = parseServerDate(h.startDate);
              const end   = h.endDate ? parseServerDate(h.endDate) : null;
              const sameDay = !end || localIso(start) === localIso(end);
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', padding: '3px 0', color: 'var(--text)' }}>
                  <span>🎉 {h.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {!sameDay ? ` – ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                  </span>
                </div>
              );
            })}
            {monthHolidays.length > 4 && (
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', paddingTop: 2 }}>+{monthHolidays.length - 4} more</div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 12, fontSize: '.72rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', display: 'inline-block' }} />Today
            </span>
            {holidays.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#fef3c7', border: '1px solid #fcd34d', display: 'inline-block' }} />Holiday
              </span>
            )}
            {leaves.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(180,83,9,.13)', border: '1px solid #b45309', display: 'inline-block' }} />My Leave
              </span>
            )}
          </div>
          {holidayListPath && (
            <Link to={holidayListPath} style={{ fontSize: '.78rem', color: 'var(--primary)', textDecoration: 'none' }}>
              All holidays →
            </Link>
          )}
        </div>

      </div>
    </div>
  );
}
