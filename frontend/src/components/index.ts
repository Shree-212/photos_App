// Component exports for easy importing
export { FileUpload, MediaPreview } from './FileUpload';
export { MediaCarousel } from './MediaCarousel';
export { MediaManager } from './MediaManager';
export { AuthenticatedImage } from './AuthenticatedImage';

// Album Components (formerly task components)
export { AlbumForm } from './AlbumForm';
export { AlbumCard, TaskCard } from './AlbumCard';

// Photo Components
export { PhotosGrid } from './PhotosGrid';
export { PhotoViewer } from './PhotoViewer';
export { PhotosTab } from './PhotosTab';

// Backward compatibility aliases
export { TaskForm } from './TaskForm';

// Re-export types from the types directory
export type { Task, Album, MediaFile, CreateTaskData, CreateAlbumData, UpdateTaskData, UpdateAlbumData, User } from '../types';
