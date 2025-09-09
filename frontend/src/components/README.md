# Frontend Media Management Components

This directory contains React components for managing media attachments in tasks, providing a comprehensive media management system with upload, browsing, and attachment capabilities.

## Components

### 1. FileUpload.tsx
A drag-and-drop file upload component with validation and progress tracking.

**Features:**
- Drag and drop file upload
- File type validation (images, documents)
- Upload progress tracking
- Image preview thumbnails
- File size validation
- Error handling and user feedback

**Usage:**
```tsx
import { FileUpload } from './FileUpload';

<FileUpload 
  onUploadSuccess={(media) => console.log('Uploaded:', media)}
  onUploadError={(error) => console.log('Error:', error)}
  maxSizeBytes={10 * 1024 * 1024} // 10MB
  allowedTypes={['image/jpeg', 'image/png', 'application/pdf']}
/>
```

### 2. MediaCarousel.tsx
A full-featured image carousel with navigation, fullscreen mode, and download capabilities.

**Features:**
- Image navigation with thumbnails
- Fullscreen viewing mode
- Keyboard navigation (arrow keys, escape)
- Download functionality
- Metadata display
- Responsive design

**Usage:**
```tsx
import { MediaCarousel } from './MediaCarousel';

<MediaCarousel
  media={mediaFiles}
  initialIndex={0}
  onClose={() => setShowCarousel(false)}
/>
```

### 3. MediaManager.tsx
A comprehensive media browsing interface with search, filtering, and selection capabilities.

**Features:**
- Grid and list view modes
- Search functionality
- Filter by file type
- Sorting options (name, date, size)
- Multi-select mode
- Bulk selection actions
- Integrated file upload
- Responsive grid layout

**Usage:**
```tsx
import { MediaManager } from './MediaManager';

<MediaManager
  onSelectMedia={(selectedFiles) => console.log('Selected:', selectedFiles)}
  multiSelect={true}
  showUpload={true}
/>
```

### 4. TaskForm.tsx
An enhanced task creation/editing form with media attachment capabilities.

**Features:**
- Form validation with Zod schema
- Media attachment via upload or selection
- Live preview of attached media
- Status and priority selection with visual indicators
- Real-time form validation
- Error handling and user feedback

**Usage:**
```tsx
import { TaskForm } from './TaskForm';

<TaskForm
  task={existingTask} // Optional for editing
  onSubmit={handleTaskSubmit}
  onCancel={() => setShowForm(false)}
  loading={submitting}
/>
```

### 5. TaskCard.tsx
A task display component with integrated media preview and interaction capabilities.

**Features:**
- Task information display
- Media attachment thumbnails
- Status change interactions
- Priority indicators
- Action menu (edit, delete, view)
- Media carousel integration
- Responsive design

**Usage:**
```tsx
import { TaskCard } from './TaskCard';

<TaskCard
  task={taskData}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onStatusChange={handleStatusChange}
  showActions={true}
/>
```

## Type Definitions

All components use shared TypeScript interfaces defined in `../types/index.ts`:

- `MediaFile`: Represents uploaded media files
- `Task`: Task data structure with media attachments
- `CreateTaskData`: Data for creating new tasks
- `UpdateTaskData`: Data for updating existing tasks

## Dependencies

The components require the following packages:

```json
{
  "react-dropzone": "^14.2.3",
  "swiper": "^11.0.5", 
  "date-fns": "^2.30.0",
  "react-hook-form": "^7.48.2",
  "@hookform/resolvers": "^3.3.2",
  "zod": "^3.22.4",
  "lucide-react": "^0.292.0"
}
```

## API Integration

The components integrate with the following backend endpoints:

- `POST /api/media/upload` - File upload
- `GET /api/media` - List media files
- `GET /api/media/:id` - Get specific media file
- `DELETE /api/media/:id` - Delete media file
- `POST /api/tasks` - Create task with media attachments
- `PUT /api/tasks/:id` - Update task with media attachments

## Styling

Components use Tailwind CSS for styling with:
- Responsive design patterns
- Consistent color schemes
- Hover and focus states
- Loading states and animations
- Error state styling

## Features Implementation

### Media Upload Flow
1. User drags files to FileUpload component
2. Files are validated for type and size
3. Upload progress is displayed
4. Successful uploads return MediaFile objects
5. Files can be attached to tasks or managed independently

### Media Selection Flow  
1. MediaManager displays available files
2. Users can search, filter, and sort files
3. Files can be selected individually or in bulk
4. Selected files are returned to parent component
5. Integration with TaskForm for attachment

### Task Management Flow
1. TaskForm allows creating/editing tasks
2. Media can be uploaded directly or selected from existing
3. Attached media is displayed as thumbnails
4. TaskCard shows tasks with media previews
5. MediaCarousel provides full viewing experience

## Best Practices

1. **Error Handling**: All components include comprehensive error handling
2. **Loading States**: Visual feedback during async operations
3. **Accessibility**: Keyboard navigation and screen reader support
4. **Performance**: Lazy loading and optimized rendering
5. **User Experience**: Intuitive interactions and clear feedback

## Future Enhancements

Potential improvements and features:
- Video file support with preview
- Image editing capabilities
- Bulk upload operations
- Advanced search filters
- Cloud storage integration
- Real-time collaboration features
