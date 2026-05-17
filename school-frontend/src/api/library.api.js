import api from './axios';

// ── Librarian / Admin ─────────────────────────────────────────────────────────
export const getDashboard        = ()           => api.get('/library/dashboard');
export const getBooks            = (params)     => api.get('/library/books', { params });
export const getBook             = (id)         => api.get(`/library/books/${id}`);
export const createBook          = (data)       => api.post('/library/books', data);
export const updateBook          = (id, data)   => api.put(`/library/books/${id}`, data);
export const deleteBook          = (id)         => api.delete(`/library/books/${id}`);
export const getIssuances        = (params)     => api.get('/library/issuances', { params });
export const getIssueForm        = (params)     => api.get('/library/issue', { params });
export const issueBook           = (data)       => api.post('/library/issue', data);
export const getReturnForm       = (params)     => api.get('/library/return', { params });
export const returnBook          = (data)       => api.post('/library/return', data);
export const renewBook           = (id)         => api.post(`/library/issuances/${id}/renew`);
export const getReservations     = (params)     => api.get('/library/reservations', { params });
export const markReservationReady= (id)         => api.post(`/library/reservations/${id}/mark-ready`);
export const cancelReservation   = (id)         => api.delete(`/library/reservations/${id}`);
export const getFines            = (params)     => api.get('/library/fines', { params });
export const collectFine         = (id)         => api.post(`/library/fines/${id}/collect`);
export const waiveFine           = (id, data)   => api.post(`/library/fines/${id}/waive`, data);
export const getPolicy           = ()           => api.get('/library/policy');
export const updatePolicy        = (data)       => api.put('/library/policy', data);
export const getAuditLog         = (params)     => api.get('/library/audit-log', { params });

// ── Student ────────────────────────────────────────────────────────────────────
export const studentDashboard    = ()           => api.get('/library/student');
export const studentSearch       = (params)     => api.get('/library/student/search', { params });
export const studentReserve      = (bookId)     => api.post(`/library/student/books/${bookId}/reserve`);
export const cancelMyReservation = (id)         => api.delete(`/library/student/reservations/${id}`);
export const getMyBooks          = ()           => api.get('/library/student/my-books');
export const getMyFines          = ()           => api.get('/library/student/my-fines');

// ── Teacher browse (same dashboard/search as student) ─────────────────────────
export const teacherLibDashboard = ()           => api.get('/library/teacher');
export const teacherSearch       = (params)     => api.get('/library/teacher/search', { params });
export const getTeacherMyBooks   = ()           => api.get('/library/teacher/my-books');
export const getTeacherMyFines   = ()           => api.get('/library/teacher/my-fines');
export const cancelTeacherReserv = (id)         => api.delete(`/library/teacher/reservations/${id}`);

// ── Parent ─────────────────────────────────────────────────────────────────────
export const getParentOverview   = ()           => api.get('/library/parent');
