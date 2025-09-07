import api from './auth';
import { Task, CreateTaskData, UpdateTaskData, TasksResponse, TaskStats } from '../types';

export const taskApi = {
  async getTasks(params?: {
    page?: number;
    limit?: number;
    status?: string;
    priority?: string;
    search?: string;
  }): Promise<TasksResponse> {
    const response = await api.get('/tasks', { params });
    return response.data;
  },

  async getTask(id: number): Promise<{ task: Task }> {
    const response = await api.get(`/tasks/${id}`);
    return response.data;
  },

  async createTask(data: CreateTaskData): Promise<{ message: string; task: Task }> {
    const response = await api.post('/tasks', data);
    return response.data;
  },

  async updateTask(id: number, data: UpdateTaskData): Promise<{ message: string; task: Task }> {
    const response = await api.put(`/tasks/${id}`, data);
    return response.data;
  },

  async deleteTask(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/tasks/${id}`);
    return response.data;
  },

  async getStats(): Promise<{ stats: TaskStats }> {
    const response = await api.get('/tasks/stats/summary');
    return response.data;
  },

  async uploadAttachment(
    taskId: number,
    file: File
  ): Promise<{
    message: string;
    attachment: {
      fileName: string;
      url: string;
      size: number;
      mimeType: string;
    };
  }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post(`/tasks/${taskId}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
