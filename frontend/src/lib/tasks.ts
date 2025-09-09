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
    const response = await api.get('/api/tasks', { params });
    return response.data;
  },

  async getTask(id: number): Promise<{ task: Task }> {
    const response = await api.get(`/api/tasks/${id}`);
    return response.data;
  },

  async getTaskWithMedia(id: number): Promise<{ task: Task }> {
    const response = await api.get(`/api/tasks/${id}/with-media`);
    return response.data;
  },

  async createTask(data: CreateTaskData): Promise<{ message: string; task: Task }> {
    const response = await api.post('/api/tasks', data);
    return response.data;
  },

  async updateTask(id: number, data: UpdateTaskData): Promise<{ message: string; task: Task }> {
    const response = await api.put(`/api/tasks/${id}`, data);
    return response.data;
  },

  async deleteTask(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/api/tasks/${id}`);
    return response.data;
  },

  async attachMedia(taskId: number, mediaId: number): Promise<{ message: string }> {
    const response = await api.post(`/api/tasks/${taskId}/attach-media`, { mediaId });
    return response.data;
  },

  async detachMedia(taskId: number, mediaId: number): Promise<{ message: string }> {
    const response = await api.delete(`/api/tasks/${taskId}/detach-media/${mediaId}`);
    return response.data;
  },

  async getStats(): Promise<{ stats: TaskStats }> {
    const response = await api.get('/api/tasks/stats/summary');
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

    const response = await api.post(`/api/tasks/${taskId}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};
