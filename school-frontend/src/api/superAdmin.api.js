import api from './axios';

// Dashboard
export const getDashboard = () => api.get('/super-admin/dashboard');

// Schools — axios auto-sets correct Content-Type+boundary for FormData, never override manually
export const getSchools    = (params)   => api.get('/super-admin/schools', { params });
export const getSchool     = (id)       => api.get(`/super-admin/schools/${id}`);
export const createSchool  = (data)     => api.post('/super-admin/schools', data);
export const updateSchool  = (id, data) => api.put(`/super-admin/schools/${id}`, data);
export const deleteSchool  = (id)       => api.delete(`/super-admin/schools/${id}`);

// Users
export const getUsers      = (params)   => api.get('/super-admin/users', { params });
export const getUser       = (id)       => api.get(`/super-admin/users/${id}`);
export const createUser    = (data)     => api.post('/super-admin/users', data);
export const updateUser    = (id, data) => api.put(`/super-admin/users/${id}`, data);
export const deleteUser    = (id)       => api.delete(`/super-admin/users/${id}`);
export const toggleUser    = (id)       => api.patch(`/super-admin/users/${id}/toggle`);
export const bulkDeleteUsers = (ids)    => api.delete('/super-admin/users/bulk-delete', { data: { ids } });
export const bulkTeachers  = (fd)       => api.post('/super-admin/users/bulk-teachers', fd);
export const bulkStudents  = (fd)       => api.post('/super-admin/users/bulk-students', fd);
export const downloadTeacherTemplate = () => api.get('/super-admin/users/template/teachers', { responseType: 'arraybuffer' });
export const downloadStudentTemplate = () => api.get('/super-admin/users/template/students', { responseType: 'arraybuffer' });
export const generateLoginLink = (id)  => api.post(`/super-admin/users/${id}/login-link`);

// Permissions
export const getPermissions   = ()       => api.get('/super-admin/permissions');
export const updatePermissions = (data)  => api.put('/super-admin/permissions', data);

// Logs
export const getLogs = (params) => api.get('/super-admin/logs', { params });

// Notifications
export const sendNotification = (data) => api.post('/super-admin/notifications/send', data);
