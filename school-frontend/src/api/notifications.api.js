import api from './axios';
export const getInbox            = () => api.get('/notifications/inbox');
export const getAllNotifications  = (params) => api.get('/notifications/all', { params });
export const getUnreadCount      = () => api.get('/notifications/unread-count');
export const getSent             = () => api.get('/notifications/sent');
export const markAllRead         = () => api.post('/notifications/mark-all-read');
export const clearAll            = () => api.post('/notifications/clear-all');
export const markOneRead         = (id) => api.patch(`/notifications/${id}/mark-read`);
export const clearOne            = (id) => api.delete(`/notifications/${id}`);
