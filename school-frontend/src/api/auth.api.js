import api from './axios';

export const login          = (data)  => api.post('/auth/login', data);
export const logout         = ()      => api.post('/auth/logout');
export const getMe          = ()      => api.get('/auth/me');
export const refreshToken   = (data)  => api.post('/auth/refresh', data);
export const forgotPassword = (data)  => api.post('/auth/forgot-password', data);
export const verifyOtp      = (data)  => api.post('/auth/verify-otp', data);
export const newPassword    = (data)  => api.post('/auth/new-password', data);
export const resetPassword  = (data)  => api.post('/auth/reset-password', data);
export const magicLogin     = (token) => api.get(`/auth/magic/${token}`);
