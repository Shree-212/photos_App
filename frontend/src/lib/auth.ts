import axios from 'axios';
import Cookies from 'js-cookie';
import { AuthResponse, LoginData, RegisterData, User } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}`,  // Use same origin for API requests
  timeout: 30000, // Increased to 30 seconds for LoadBalancer delays
  withCredentials: true,  // Include credentials for CORS
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - only redirect if we're not already on login page
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      if (currentPath !== '/auth/login' && currentPath !== '/auth/register') {
        console.log('401 error detected, clearing auth and redirecting to login');
        Cookies.remove('token');
        Cookies.remove('user');
        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await api.post('/api/auth/register', data);
    return response.data;
  },

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await api.post('/api/auth/login', data);
    return response.data;
  },

  async verify(): Promise<{ valid: boolean; user: User }> {
    const response = await api.post('/api/auth/verify');
    return response.data;
  },

  async logout(): Promise<{ message: string }> {
    const response = await api.post('/api/auth/logout');
    return response.data;
  },

  async getProfile(): Promise<{ user: User }> {
    const response = await api.get('/api/auth/profile');
    return response.data;
  },
};

export default api;
