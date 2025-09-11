'use client';

import React, { useState, useEffect } from 'react';
import { FileUpload, MediaPreview } from './FileUpload';
import { MediaCarousel } from './MediaCarousel';
import { Search, Grid, List, Filter, Upload, Trash2, Eye } from 'lucide-react';
import api from '../lib/auth';

interface MediaFile {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailPath?: string;
  createdAt: string;
}

interface MediaManagerProps {
  onSelectMedia?: (media: MediaFile[]) => void;
  multiSelect?: boolean;
  showUpload?: boolean;
  className?: string;
}

type ViewMode = 'grid' | 'list';
type SortOption = 'newest' | 'oldest' | 'name' | 'size';

export const MediaManager: React.FC<MediaManagerProps> = ({
  onSelectMedia,
  multiSelect = false,
  showUpload = true,
  className = ''
}) => {
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterType, setFilterType] = useState<string>('all');
  const [showCarousel, setShowCarousel] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [showUploadArea, setShowUploadArea] = useState(false);

    // Fetch media files
  const fetchMedia = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/media');
      
      const data = response.data;
      setMedia(data.media || []);
      setError(null);
    } catch (error: any) {
      console.error('Failed to fetch media:', error);
      setError(error.response?.data?.error || 'Failed to load media files');
      setMedia([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  // Filter and sort media
  const filteredMedia = React.useMemo(() => {
    let filtered = media;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.filename.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(item => item.mimeType.startsWith(filterType));
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name':
          return a.originalName.localeCompare(b.originalName);
        case 'size':
          return b.sizeBytes - a.sizeBytes;
        default:
          return 0;
      }
    });

    return filtered;
  }, [media, searchTerm, filterType, sortBy]);

  // Handle media selection
  const handleMediaSelect = (mediaItem: MediaFile) => {
    if (multiSelect) {
      const isSelected = selectedMedia.some(item => item.id === mediaItem.id);
      let newSelection;
      
      if (isSelected) {
        newSelection = selectedMedia.filter(item => item.id !== mediaItem.id);
      } else {
        newSelection = [...selectedMedia, mediaItem];
      }
      
      setSelectedMedia(newSelection);
      onSelectMedia?.(newSelection);
    } else {
      setSelectedMedia([mediaItem]);
      onSelectMedia?.([ mediaItem]);
    }
  };

  // Handle media upload
  const handleUploadSuccess = (newMedia: MediaFile) => {
    setMedia(prev => [newMedia, ...prev]);
    setShowUploadArea(false);
  };

  const handleUploadError = (error: string) => {
    setError(error);
  };

  // Handle media deletion
  const handleDeleteMedia = async (mediaItem: MediaFile) => {
    if (!confirm(`Are you sure you want to delete "${mediaItem.originalName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/api/media/${mediaItem.id}`);
      
      setMedia(prev => prev.filter(item => item.id !== mediaItem.id));
      setSelectedMedia(prev => prev.filter(item => item.id !== mediaItem.id));
      setError(null);
    } catch (err: any) {
      console.error('Delete error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to delete media');
    } finally {
      setLoading(false);
    }
  };

  // Handle bulk deletion
  const handleBulkDelete = async () => {
    if (selectedMedia.length === 0) return;

    const fileNames = selectedMedia.map(item => item.originalName).join(', ');
    if (!confirm(`Are you sure you want to delete ${selectedMedia.length} file(s)? (${fileNames})\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const deletePromises = selectedMedia.map(item => 
        api.delete(`/api/media/${item.id}`)
      );
      
      await Promise.all(deletePromises);
      
      const deletedIds = selectedMedia.map(item => item.id);
      setMedia(prev => prev.filter(item => !deletedIds.includes(item.id)));
      setSelectedMedia([]);
      setError(null);
    } catch (err: any) {
      console.error('Bulk delete error:', err);
      setError('Failed to delete some files. Please try again.');
      // Refresh the media list to sync with server state
      fetchMedia();
    } finally {
      setLoading(false);
    }
  };

  // Handle view media
  const handleViewMedia = (mediaItem: MediaFile) => {
    const index = filteredMedia.findIndex(item => item.id === mediaItem.id);
    setCarouselIndex(index);
    setShowCarousel(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Media Manager</h2>
            <p className="text-sm text-gray-500">
              {filteredMedia.length} {filteredMedia.length === 1 ? 'file' : 'files'}
              {selectedMedia.length > 0 && ` • ${selectedMedia.length} selected`}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            {selectedMedia.length > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete ({selectedMedia.length})
              </button>
            )}
            
            {showUpload && (
              <button
                onClick={() => setShowUploadArea(true)}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Media
              </button>
            )}
          </div>
        </div>

        {/* Search and filters */}
        <div className="mt-4 flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search media files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Select All checkbox */}
          {multiSelect && filteredMedia.length > 0 && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="selectAll"
                checked={selectedMedia.length === filteredMedia.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedMedia(filteredMedia);
                    onSelectMedia?.(filteredMedia);
                  } else {
                    setSelectedMedia([]);
                    onSelectMedia?.([]);
                  }
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="selectAll" className="text-sm text-gray-700">
                Select All
              </label>
            </div>
          )}

          {/* Filters */}
          <div className="flex space-x-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="application">Documents</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name A-Z</option>
              <option value="size">Size (Largest)</option>
            </select>

            {/* View mode toggle */}
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Upload area */}
      {showUploadArea && (
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <FileUpload
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={() => setShowUploadArea(false)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-50 border-b border-gray-200">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-sm text-red-500 hover:text-red-700 mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Media grid/list */}
      <div className="p-4">
        {filteredMedia.length === 0 ? (
          <div className="text-center py-12">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-gray-500">No media files found</p>
            {showUpload && (
              <button
                onClick={() => setShowUploadArea(true)}
                className="mt-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                Upload your first file
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredMedia.map((mediaItem) => (
              <div key={mediaItem.id} className="relative group">
                <MediaPreview
                  media={mediaItem}
                  onClick={() => handleMediaSelect(mediaItem)}
                  className={`cursor-pointer transition-all ${
                    selectedMedia.some(item => item.id === mediaItem.id)
                      ? 'ring-2 ring-blue-500 ring-offset-2'
                      : 'hover:shadow-md'
                  }`}
                />
                
                {/* Action buttons overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewMedia(mediaItem);
                    }}
                    className="p-2 bg-white/90 hover:bg-white rounded-full shadow-lg text-gray-700 hover:text-gray-900 transition-colors"
                    title="View Full Size"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMedia(mediaItem);
                    }}
                    disabled={loading}
                    className="p-2 bg-white/90 hover:bg-white rounded-full shadow-lg text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Delete File"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                
                {/* Selection indicator */}
                {selectedMedia.some(item => item.id === mediaItem.id) && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredMedia.map((mediaItem) => (
              <div
                key={mediaItem.id}
                onClick={() => handleMediaSelect(mediaItem)}
                className={`flex items-center space-x-4 p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedMedia.some(item => item.id === mediaItem.id)
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <div className="w-12 h-12 relative rounded overflow-hidden bg-gray-100">
                  <MediaPreview
                    media={mediaItem}
                    className="w-full h-full"
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{mediaItem.originalName}</p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(mediaItem.sizeBytes)} • {formatDate(mediaItem.createdAt)}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewMedia(mediaItem);
                    }}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="View Full Size"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteMedia(mediaItem);
                    }}
                    disabled={loading}
                    className="p-2 text-red-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Delete File"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Media carousel modal */}
      {showCarousel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-full">
            <MediaCarousel
              media={filteredMedia}
              initialIndex={carouselIndex}
              onClose={() => setShowCarousel(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
