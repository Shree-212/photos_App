export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MediaFile {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  createdAt: string;
}

export interface Album {
  id: number;
  title: string;
  description?: string;
  tags: ('childhood' | 'love' | 'family' | 'friends' | 'travel' | 'nature' | 'food' | 'celebration' | 'work' | 'pets' | 'hobbies' | 'sports' | 'art' | 'music')[];
  category: 'nostalgia' | 'emotions' | 'happiness' | 'pride' | 'dreams' | 'vibe' | 'inspiration' | 'memories';
  userId: number;
  createdAt: string;
  updatedAt: string;
  media?: MediaFile[];
}

export interface CreateAlbumData {
  title: string;
  description?: string;
  tags?: ('childhood' | 'love' | 'family' | 'friends' | 'travel' | 'nature' | 'food' | 'celebration' | 'work' | 'pets' | 'hobbies' | 'sports' | 'art' | 'music')[];
  category?: 'nostalgia' | 'emotions' | 'happiness' | 'pride' | 'dreams' | 'vibe' | 'inspiration' | 'memories';
  mediaIds?: number[];
}

export interface UpdateAlbumData {
  title?: string;
  description?: string;
  tags?: ('childhood' | 'love' | 'family' | 'friends' | 'travel' | 'nature' | 'food' | 'celebration' | 'work' | 'pets' | 'hobbies' | 'sports' | 'art' | 'music')[];
  category?: 'nostalgia' | 'emotions' | 'happiness' | 'pride' | 'dreams' | 'vibe' | 'inspiration' | 'memories';
  mediaIds?: number[];
}

export interface AlbumsResponse {
  albums: Album[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface AlbumStats {
  total: number;
  childhood: number;
  love: number;
  family: number;
  nostalgia: number;
  happiness: number;
  inspiration: number;
}

// Backward compatibility - Task is now just an alias for Album
export type Task = Album;
export type CreateTaskData = CreateAlbumData;
export type UpdateTaskData = UpdateAlbumData;
export type TasksResponse = AlbumsResponse;
export type TaskStats = AlbumStats;

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface ApiError {
  error: string;
  details?: string[];
  message?: string;
}
