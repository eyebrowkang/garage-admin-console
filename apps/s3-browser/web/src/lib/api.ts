import axios from 'axios';

const apiBaseURL = import.meta.env.VITE_API_BASE_URL || '/api';

export const api = axios.create({
  baseURL: apiBaseURL,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401/403 — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      localStorage.removeItem('token');
      const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
      window.location.href = `${base}/login`;
    }
    return Promise.reject(error);
  },
);
