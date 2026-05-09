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
