import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    const status  = err.response?.status;
    const message = err.response?.data?.message || 'Something went wrong';

    if (status === 401) {
      const url = err.config?.url || '';
      // Auth endpoints return 401 for bad credentials — don't treat as session expiry
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');
      if (!isAuthEndpoint) {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken && !err.config._retry) {
          err.config._retry = true;
          try {
            const data = await axios.post('/api/auth/refresh', { refreshToken });
            localStorage.setItem('token', data.data.token);
            err.config.headers.Authorization = `Bearer ${data.data.token}`;
            return api(err.config);
          } catch {
            localStorage.clear();
            window.location.href = '/login';
          }
        } else {
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }

    if (status === 403 && err.response?.data?.code === 'MODULE_DISABLED') {
      toast.error('This module is not enabled for your school');
    }

    return Promise.reject({ message, status, data: err.response?.data });
  },
);

export default api;
