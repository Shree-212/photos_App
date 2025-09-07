import axios from 'axios';
import Cookies from 'js-cookie';
import { AuthResponse, LoginData, RegisterData, User } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}`,  // Remove /api prefix for direct service access
  timeout: 10000,
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
      // Token expired or invalid, redirect to login
      Cookies.remove('token');
      Cookies.remove('user');
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
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
