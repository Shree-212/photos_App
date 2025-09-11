import api from './auth';
import { Album, CreateAlbumData, UpdateAlbumData, AlbumsResponse, AlbumStats } from '../types';

export const albumApi = {
  async getAlbums(params?: {
    page?: number;
    limit?: number;
    tags?: string[];
    category?: string;
    search?: string;
  }): Promise<AlbumsResponse> {
    const response = await api.get('/api/albums', { params });
    return response.data;
  },

  async getAlbum(id: number): Promise<{ album: Album }> {
    const response = await api.get(`/api/albums/${id}`);
    return response.data;
  },

  async getAlbumWithMedia(id: number): Promise<{ album: Album }> {
    const response = await api.get(`/api/albums/${id}/with-media`);
    return response.data;
  },

  async createAlbum(data: CreateAlbumData): Promise<{ message: string; album: Album }> {
    const response = await api.post('/api/albums', data);
    return response.data;
  },

  async updateAlbum(id: number, data: UpdateAlbumData): Promise<{ message: string; album: Album }> {
    const response = await api.put(`/api/albums/${id}`, data);
    return response.data;
  },

  async deleteAlbum(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/api/albums/${id}`);
    return response.data;
  },

  async attachMedia(albumId: number, mediaId: number): Promise<{ message: string }> {
    const response = await api.post(`/api/albums/${albumId}/media`, { mediaId });
    return response.data;
  },

  async detachMedia(albumId: number, mediaId: number): Promise<{ message: string }> {
    const response = await api.delete(`/api/albums/${albumId}/media/${mediaId}`);
    return response.data;
  },

  async getStats(): Promise<{ stats: AlbumStats }> {
    const response = await api.get('/api/albums/stats/summary');
    return response.data;
  },

  async getAlbumMedia(albumId: number) {
    const response = await api.get(`/api/albums/${albumId}/media`);
    return response.data;
  }
};

// Backward compatibility - keep taskApi as an alias
export const taskApi = {
  async getTasks(params?: {
    page?: number;
    limit?: number;
    status?: string;
    priority?: string;
    search?: string;
  }) {
    // Map old parameters to new album parameters
    const albumParams = {
      page: params?.page,
      limit: params?.limit,
      search: params?.search,
      // Map status to tags
      ...(params?.status && { tags: [params.status] }),
      // Map priority to category
      ...(params?.priority === 'high' && { category: 'inspiration' }),
      ...(params?.priority === 'medium' && { category: 'happiness' }),
      ...(params?.priority === 'low' && { category: 'memories' })
    };
    
    const response = await albumApi.getAlbums(albumParams);
    // Transform response for backward compatibility
    return {
      tasks: response.albums,
      pagination: response.pagination
    };
  },

  async getTask(id: number) {
    const response = await albumApi.getAlbum(id);
    return { task: response.album };
  },

  async getTaskWithMedia(id: number) {
    const response = await albumApi.getAlbumWithMedia(id);
    return { task: response.album };
  },

  async createTask(data: any) {
    // Transform task data to album data
    const albumData: CreateAlbumData = {
      title: data.title,
      description: data.description,
      tags: data.status ? [data.status] : [],
      category: (data.priority === 'high' ? 'inspiration' : 
                 data.priority === 'medium' ? 'happiness' : 'memories') as any,
      mediaIds: data.mediaIds
    };
    
    const response = await albumApi.createAlbum(albumData);
    return { message: response.message, task: response.album };
  },

  async updateTask(id: number, data: any) {
    // Transform task data to album data
    const albumData: UpdateAlbumData = {
      title: data.title,
      description: data.description,
      ...(data.status && { tags: [data.status] }),
      ...(data.priority && { 
        category: (data.priority === 'high' ? 'inspiration' : 
                   data.priority === 'medium' ? 'happiness' : 'memories') as any
      }),
      mediaIds: data.mediaIds
    };
    
    const response = await albumApi.updateAlbum(id, albumData);
    return { message: response.message, task: response.album };
  },

  async deleteTask(id: number) {
    return albumApi.deleteAlbum(id);
  },

  async attachMedia(taskId: number, mediaId: number) {
    return albumApi.attachMedia(taskId, mediaId);
  },

  async detachMedia(taskId: number, mediaId: number) {
    return albumApi.detachMedia(taskId, mediaId);
  },

  async getStats() {
    const response = await albumApi.getStats();
    // Transform album stats to task stats format for backward compatibility
    return {
      stats: {
        total: response.stats.total,
        pending: response.stats.childhood,
        in_progress: response.stats.love,
        completed: response.stats.family,
        cancelled: 0,
        high_priority: response.stats.inspiration,
        overdue: 0
      }
    };
  }
};
