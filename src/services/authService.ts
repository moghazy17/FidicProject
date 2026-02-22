import axios from 'axios';
import apiClient from './apiClient';
import type { LoginResponse, UserProfile } from '../types';

const baseURL = import.meta.env.VITE_API_BASE_URL;

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    // Backend expects form-urlencoded with 'username' field
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);

    const response = await axios.post<LoginResponse>(`${baseURL}/auth/login`, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  },

  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    const response = await axios.post<LoginResponse>(`${baseURL}/auth/refresh`, {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  async getProfile(): Promise<UserProfile> {
    const response = await apiClient.get<UserProfile>('/auth/me');
    return response.data;
  },
};
