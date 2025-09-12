'use client';

import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { Album, CreateAlbumData, UpdateAlbumData, MediaFile } from '../types';
import { albumApi } from '../lib/albums';
import { MediaManager } from './MediaManager';
import { AuthenticatedImage } from './AuthenticatedImage';

interface AlbumFormProps {
  album?: Album | null;
  onSubmit: (data: CreateAlbumData | UpdateAlbumData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const albumSchema = z.object({
  title: z.string().min(1, 'Album title is required').max(255, 'Title too long'),
  description: z.string().max(1000, 'Description too long').optional(),
  tags: z.array(z.enum(['childhood', 'love', 'family', 'friends', 'travel', 'nature', 'food', 'celebration', 'work', 'pets', 'hobbies', 'sports', 'art', 'music'])),
  category: z.enum(['nostalgia', 'emotions', 'happiness', 'pride', 'dreams', 'vibe', 'inspiration', 'memories'])
});

type AlbumFormData = z.infer<typeof albumSchema>;

const tagOptions = [
  { value: 'childhood', label: 'Childhood', emoji: '👶' },
  { value: 'love', label: 'Love', emoji: '❤️' },
  { value: 'family', label: 'Family', emoji: '👨‍👩‍👧‍👦' },
  { value: 'friends', label: 'Friends', emoji: '👫' },
  { value: 'travel', label: 'Travel', emoji: '✈️' },
  { value: 'nature', label: 'Nature', emoji: '🌳' },
  { value: 'food', label: 'Food', emoji: '🍽️' },
  { value: 'celebration', label: 'Celebration', emoji: '🎉' },
  { value: 'work', label: 'Work', emoji: '💼' },
  { value: 'pets', label: 'Pets', emoji: '🐕' },
  { value: 'hobbies', label: 'Hobbies', emoji: '🎨' },
  { value: 'sports', label: 'Sports', emoji: '⚽' },
  { value: 'art', label: 'Art', emoji: '🎭' },
  { value: 'music', label: 'Music', emoji: '🎵' }
] as const;

const categoryOptions = [
  { value: 'memories', label: 'Memories', description: 'Precious moments from the past', emoji: '📸' },
  { value: 'nostalgia', label: 'Nostalgia', description: 'Longing for times gone by', emoji: '🕰️' },
  { value: 'emotions', label: 'Emotions', description: 'Feelings and sentiments', emoji: '💭' },
  { value: 'happiness', label: 'Happiness', description: 'Joyful and uplifting moments', emoji: '😊' },
  { value: 'pride', label: 'Pride', description: 'Achievements and accomplishments', emoji: '🏆' },
  { value: 'dreams', label: 'Dreams', description: 'Aspirations and hopes', emoji: '✨' },
  { value: 'vibe', label: 'Vibe', description: 'Mood and atmosphere', emoji: '🌟' },
  { value: 'inspiration', label: 'Inspiration', description: 'Motivating and creative moments', emoji: '💡' }
] as const;

export const AlbumForm: React.FC<AlbumFormProps> = ({
  album,
  onSubmit,
  onCancel,
  isLoading = false
}) => {
  const [formData, setFormData] = useState<AlbumFormData>({
    title: album?.title || '',
    description: album?.description || '',
    tags: album?.tags || [],
    category: album?.category || 'memories'
  });
  
  const [selectedMedia, setSelectedMedia] = useState<MediaFile[]>(album?.media || []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showMediaManager, setShowMediaManager] = useState(false);

  useEffect(() => {
    if (album) {
      setFormData({
        title: album.title,
        description: album.description || '',
        tags: album.tags,
        category: album.category
      });
      setSelectedMedia(album.media || []);
    }
  }, [album]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validatedData = albumSchema.parse(formData);
      const submitData = {
        ...validatedData,
        mediaIds: selectedMedia.map(media => media.id)
      };
      
      await onSubmit(submitData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleTagToggle = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tag as any)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag as any]
    }));
  };

  const handleMediaSelect = (media: MediaFile[]) => {
    setSelectedMedia(media);
    // Don't close immediately - let user continue selecting
  };

  const handleMediaManagerClose = () => {
    setShowMediaManager(false);
  };

  const removeMedia = (mediaId: number) => {
    setSelectedMedia(prev => prev.filter(m => m.id !== mediaId));
  };

  return (
    <div className="space-y-6 bg-white rounded-lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Album Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
            Album Title *
          </label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
              errors.title ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Give your album a memorable title..."
          />
          {errors.title && (
            <p className="mt-1 text-sm text-red-600">{errors.title}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none ${
              errors.description ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Describe what makes this album special..."
          />
          {errors.description && (
            <p className="mt-1 text-sm text-red-600">{errors.description}</p>
          )}
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Category *
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {categoryOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, category: option.value }))}
                className={`p-4 rounded-xl border text-left transition-all hover:shadow-md ${
                  formData.category === option.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="text-xl mb-2">{option.emoji}</div>
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-gray-500 mt-1">{option.description}</div>
              </button>
            ))}
          </div>
          {errors.category && (
            <p className="mt-1 text-sm text-red-600">{errors.category}</p>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tags
          </label>
          <div className="flex flex-wrap gap-2">
            {tagOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleTagToggle(option.value)}
                className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full text-sm transition-all hover:shadow-sm ${
                  formData.tags.includes(option.value)
                    ? 'bg-blue-100 text-blue-800 border border-blue-300 shadow-sm'
                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                }`}
              >
                <span>{option.emoji}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          {errors.tags && (
            <p className="mt-1 text-sm text-red-600">{errors.tags}</p>
          )}
        </div>

        {/* Media Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Photos & Videos
          </label>
          
          <button
            type="button"
            onClick={() => setShowMediaManager(true)}
            className="mb-4 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>
              {selectedMedia.length > 0 ? `Manage Photos (${selectedMedia.length} selected)` : 'Add Photos'}
            </span>
          </button>

          {selectedMedia.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {selectedMedia.map((media) => (
                <div key={media.id} className="relative group">
                  <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                    {media.mimeType.startsWith('image/') ? (
                      <AuthenticatedImage
                        src={media.thumbnailUrl || `/api/media/${media.id}/thumbnail`}
                        alt={media.originalName}
                        className="w-full h-full object-cover"
                        fill
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800 text-white">
                        <span className="text-2xl">🎬</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMedia(media.id)}
                    className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-sm hover:bg-red-600 transition-colors shadow-lg"
                  >
                    ×
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white text-xs p-2 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    {media.originalName}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit Buttons */}
        <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isLoading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Saving...</span>
              </span>
            ) : (
              album ? 'Update Album' : 'Create Album'
            )}
          </button>
        </div>
      </form>

      {/* Media Manager Modal */}
      {showMediaManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Select Photos & Videos</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Choose multiple files to add to your album. You can select multiple items and upload new ones.
                </p>
              </div>
              <button
                onClick={handleMediaManagerClose}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-200 rounded-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto">
              <MediaManager
                onSelectMedia={handleMediaSelect}
                multiSelect={true}
                showUpload={true}
              />
            </div>
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm text-gray-600 font-medium">
                  {selectedMedia.length} {selectedMedia.length === 1 ? 'file' : 'files'} selected
                </span>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleMediaManagerClose}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleMediaManagerClose}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
