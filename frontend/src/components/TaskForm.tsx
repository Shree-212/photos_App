'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileUpload, MediaPreview } from './FileUpload';
import { MediaManager } from './MediaManager';
import { Plus, X, Image as ImageIcon, Paperclip } from 'lucide-react';
import { Task, MediaFile, CreateTaskData, UpdateTaskData } from '../types';

interface TaskFormProps {
  task?: Task;
  onSubmit: (task: CreateTaskData | UpdateTaskData) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  className?: string;
}

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  status: z.enum(['pending', 'in-progress', 'completed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high'])
});

type TaskFormData = z.infer<typeof taskSchema>;

export const TaskForm: React.FC<TaskFormProps> = ({
  task,
  onSubmit,
  onCancel,
  loading = false,
  className = ''
}) => {
  const [attachedMedia, setAttachedMedia] = useState<MediaFile[]>(task?.media || []);
  const [showMediaManager, setShowMediaManager] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task?.title || '',
      description: task?.description || '',
      status: task?.status || 'pending',
      priority: task?.priority || 'medium'
    }
  });

  const watchedFields = watch();

  const handleFormSubmit = async (data: TaskFormData) => {
    try {
      await onSubmit({
        ...data,
        mediaIds: attachedMedia.map(media => media.id)
      });
    } catch (error) {
      console.error('Form submission error:', error);
      // Re-throw the error so it can be handled by the parent component
      throw error;
    }
  };

  const handleMediaUpload = (media: MediaFile) => {
    setAttachedMedia(prev => [...prev, media]);
    setShowUpload(false);
    setUploadError(null);
  };

  const handleMediaSelect = (selectedMedia: MediaFile[]) => {
    setAttachedMedia(prev => {
      const newMedia = selectedMedia.filter(
        media => !prev.some(existing => existing.id === media.id)
      );
      return [...prev, ...newMedia];
    });
    setShowMediaManager(false);
  };

  const handleRemoveMedia = (mediaId: number) => {
    setAttachedMedia(prev => prev.filter(media => media.id !== mediaId));
  };

  const handleUploadError = (error: string) => {
    setUploadError(error);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-800';
      case 'in-progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {task ? 'Edit Task' : 'Create New Task'}
          </h2>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Title *
          </label>
          <input
            id="title"
            type="text"
            {...register('title')}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.title ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Enter task title..."
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            {...register('description')}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.description ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Enter task description..."
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
          )}
        </div>

        {/* Status and Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              id="status"
              {...register('status')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="pending">Pending</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="mt-2">
              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(watchedFields.status)}`}>
                {watchedFields.status?.charAt(0).toUpperCase() + watchedFields.status?.slice(1).replace('-', ' ')}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-2">
              Priority
            </label>
            <select
              id="priority"
              {...register('priority')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <div className="mt-2">
              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(watchedFields.priority)}`}>
                {watchedFields.priority?.charAt(0).toUpperCase() + watchedFields.priority?.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Media Attachments */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Attachments ({attachedMedia.length})
            </label>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="inline-flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4 mr-1" />
                Upload
              </button>
              <button
                type="button"
                onClick={() => setShowMediaManager(true)}
                className="inline-flex items-center px-3 py-1 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <ImageIcon className="h-4 w-4 mr-1" />
                Browse
              </button>
            </div>
          </div>

          {/* Upload Error */}
          {uploadError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{uploadError}</p>
            </div>
          )}

          {/* Upload Area */}
          {showUpload && (
            <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <FileUpload
                onUploadSuccess={handleMediaUpload}
                onUploadError={handleUploadError}
                className="border-gray-300"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowUpload(false);
                    setUploadError(null);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Attached Media Grid */}
          {attachedMedia.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {attachedMedia.map((media) => (
                <div key={media.id} className="relative">
                  <MediaPreview
                    media={media}
                    onRemove={() => handleRemoveMedia(media.id)}
                    showRemove={true}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
              <Paperclip className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">No attachments</p>
              <p className="text-xs text-gray-400">Upload files or browse existing media</p>
            </div>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !isValid}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center"
          >
            {loading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            )}
            {task ? 'Update Task' : 'Create Task'}
          </button>
        </div>
      </form>

      {/* Media Manager Modal */}
      {showMediaManager && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <MediaManager
              onSelectMedia={handleMediaSelect}
              multiSelect={true}
              showUpload={false}
              className="max-h-full overflow-auto"
            />
            <div className="bg-white border-t border-gray-200 p-4 flex justify-end">
              <button
                onClick={() => setShowMediaManager(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
