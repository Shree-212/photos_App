'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import { User, LoginData, RegisterData } from '../types';
import { authApi } from '../lib/auth';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      console.log('Initializing authentication...');
      const savedToken = Cookies.get('token');
      const savedUser = Cookies.get('user');

      if (savedToken && savedUser) {
        try {
          console.log('Found saved credentials, setting state...');
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          
          // Don't verify token immediately to avoid rate limiting
          // Let the first API call handle verification
          console.log('Token set from saved credentials');
        } catch (error) {
          // Token is invalid, clear everything
          console.warn('Error parsing saved credentials, clearing:', error);
          Cookies.remove('token');
          Cookies.remove('user');
          setToken(null);
          setUser(null);
        }
      } else {
        console.log('No saved credentials found');
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (data: LoginData) => {
    try {
      setLoading(true);
      console.log('Attempting login for:', data.email);
      
      const response = await authApi.login(data);
      console.log('Login response received:', response.message);
      
      setToken(response.token);
      setUser(response.user);
      
      // Save to cookies
      Cookies.set('token', response.token, { expires: 1 }); // 1 day
      Cookies.set('user', JSON.stringify(response.user), { expires: 1 });
      
      toast.success('Login successful!');
      console.log('Login state updated successfully');
    } catch (error: any) {
      console.error('Login error:', error);
      const message = error.response?.data?.error || error.message || 'Login failed';
      toast.error(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: RegisterData) => {
    try {
      setLoading(true);
      const response = await authApi.register(data);
      
      setToken(response.token);
      setUser(response.user);
      
      // Save to cookies
      Cookies.set('token', response.token, { expires: 1 });
      Cookies.set('user', JSON.stringify(response.user), { expires: 1 });
      
      toast.success('Registration successful!');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Registration failed';
      toast.error(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      console.log('Attempting logout...');
      await authApi.logout();
      console.log('Server logout successful');
    } catch (error) {
      // Even if logout fails on server, clear local state
      console.error('Logout error:', error);
    } finally {
      console.log('Clearing local authentication state...');
      setToken(null);
      setUser(null);
      Cookies.remove('token');
      Cookies.remove('user');
      toast.success('Logged out successfully');
      console.log('Local state cleared successfully');
    }
  };

  const value = {
    user,
    token,
    login,
    register,
    logout,
    loading,
    isAuthenticated: !!user && !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
