'use client';

import React, { useState, useEffect } from 'react';
import { MediaFile } from '../types';
import { AuthenticatedImage } from './AuthenticatedImage';
import api from '../lib/auth';

interface PhotosGridProps {
  className?: string;
  onPhotoClick?: (photo: MediaFile, allPhotos: MediaFile[]) => void;
}

export const PhotosGrid: React.FC<PhotosGridProps> = ({
  className = '',
  onPhotoClick
}) => {
  const [photos, setPhotos] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');

  useEffect(() => {
    fetchAllPhotos();
  }, []);

  const fetchAllPhotos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/media', {
        params: {
          type: 'image',
          sort: 'created_at',
          order: 'desc',
          limit: 1000 // Get lots of photos for the grid
        }
      });
      
      // Only include images, filter out videos and other media types
      const imageFiles = response.data.media?.filter((file: MediaFile) => 
        file.mimeType.startsWith('image/')
      ) || [];
      
      setPhotos(imageFiles);
    } catch (err) {
      console.error('Failed to fetch photos:', err);
      setError('Failed to load photos');
    } finally {
      setLoading(false);
    }
  };

  // Group photos by date with better organization (Google Photos style)
  const groupPhotosByDate = (photos: MediaFile[]) => {
    const grouped: Record<string, { photos: MediaFile[], displayDate: string, relativeDate: string, sortDate: Date }> = {};
    
    photos.forEach(photo => {
      // Parse the date from the createdAt timestamp
      const date = new Date(photo.createdAt);
      
      // Validate that the date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date for photo:', photo.originalName, photo.createdAt);
        return; // Skip this photo if date is invalid
      }
      
      const now = new Date();
      
      // Reset time to midnight for proper day-based grouping (like Google Photos)
      const photoDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const diffTime = todayDate.getTime() - photoDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // Create date key for grouping (YYYY-MM-DD format)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      // Create display date (exactly like Google Photos)
      const displayDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
      
      // Create relative date (Google Photos style)
      let relativeDate = '';
      if (diffDays === 0) {
        relativeDate = 'Today';
      } else if (diffDays === 1) {
        relativeDate = 'Yesterday';
      } else if (diffDays <= 6) {
        relativeDate = `${diffDays} days ago`;
      } else if (diffDays <= 30) {
        const weeks = Math.floor(diffDays / 7);
        relativeDate = `${weeks} week${weeks > 1 ? 's' : ''} ago`;
      } else if (diffDays <= 365) {
        const months = Math.floor(diffDays / 30);
        relativeDate = `${months} month${months > 1 ? 's' : ''} ago`;
      } else {
        const years = Math.floor(diffDays / 365);
        relativeDate = `${years} year${years > 1 ? 's' : ''} ago`;
      }
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          photos: [],
          displayDate,
          relativeDate,
          sortDate: photoDate
        };
      }
      grouped[dateKey].photos.push(photo);
    });
    
    // Sort photos within each day by time (most recent first)
    Object.values(grouped).forEach(group => {
      group.photos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    
    return grouped;
  };

  // Group photos by month for collection view
  const groupPhotosByMonth = (photos: MediaFile[]) => {
    const grouped: Record<string, { photos: MediaFile[], displayDate: string, count: number }> = {};
    
    photos.forEach(photo => {
      // Parse the date from the createdAt timestamp
      const date = new Date(photo.createdAt);
      
      // Validate that the date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date for photo:', photo.originalName, photo.createdAt);
        return; // Skip this photo if date is invalid
      }
      
      // Create month key for grouping (use local date to avoid timezone issues)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${month}`; // YYYY-MM
      
      const displayDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long'
      });
      
      if (!grouped[monthKey]) {
        grouped[monthKey] = {
          photos: [],
          displayDate,
          count: 0
        };
      }
      grouped[monthKey].photos.push(photo);
      grouped[monthKey].count++;
    });
    
    return grouped;
  };

  const groupedPhotos = groupPhotosByDate(photos);
  const groupedByMonth = groupPhotosByMonth(photos);
  const sortedDateKeys = Object.keys(groupedPhotos).sort((a, b) => b.localeCompare(a)); // Newest first
  const sortedMonthKeys = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a)); // Newest first

  // Enhanced debug logging to help troubleshoot date grouping
  console.log('=== PhotosGrid Debug Information ===');
  console.log('Total photos loaded:', photos.length);
  console.log('Number of date groups:', Object.keys(groupedPhotos).length);
  console.log('Date groups created:', sortedDateKeys);
  
  if (photos.length > 0) {
    console.log('Sample photo dates:');
    photos.slice(0, 5).forEach((photo, index) => {
      const date = new Date(photo.createdAt);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      console.log(`  ${index + 1}. ${photo.originalName}`);
      console.log(`     Raw date: ${photo.createdAt}`);
      console.log(`     Parsed: ${date.toString()}`);
      console.log(`     Date key: ${dateKey}`);
      console.log(`     Group exists: ${!!groupedPhotos[dateKey]}`);
    });
  }
  
  // Show detailed grouping
  sortedDateKeys.slice(0, 3).forEach(dateKey => {
    const group = groupedPhotos[dateKey];
    console.log(`Group ${dateKey}: ${group.photos.length} photos - "${group.displayDate}" (${group.relativeDate})`);
  });

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center py-12`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading your photos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className} flex items-center justify-center py-12`}>
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={fetchAllPhotos}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className={`${className} flex items-center justify-center py-12`}>
        <div className="text-center">
          <div className="text-6xl mb-4">📸</div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No photos yet</h3>
          <p className="text-gray-500 mb-4">Upload some photos to see them here in a beautiful grid layout</p>
          <button
            onClick={() => window.location.href = '/dashboard?tab=albums'}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Create Your First Album
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Photos</h2>
        <p className="text-gray-600">
          {photos.length} photo{photos.length !== 1 ? 's' : ''} • Organized by date
          {sortedDateKeys.length > 1 && (
            <span className="text-blue-600 font-medium"> • {sortedDateKeys.length} days</span>
          )}
        </p>
        {sortedDateKeys.length > 0 && (
          <p className="text-sm text-gray-500 mt-1">
            From {groupedPhotos[sortedDateKeys[sortedDateKeys.length - 1]]?.displayDate} 
            to {groupedPhotos[sortedDateKeys[0]]?.displayDate}
          </p>
        )}
      </div>

      {/* Date Filter and View Mode */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Filter by date:</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            >
              <option value="all">All dates ({photos.length} photos)</option>
              {viewMode === 'daily' ? (
                sortedDateKeys.slice(0, 30).map(dateKey => {
                  const group = groupedPhotos[dateKey];
                  return (
                    <option key={dateKey} value={dateKey}>
                      {group.displayDate} ({group.photos.length} photo{group.photos.length !== 1 ? 's' : ''})
                    </option>
                  );
                })
              ) : (
                sortedMonthKeys.slice(0, 12).map(monthKey => {
                  const group = groupedByMonth[monthKey];
                  return (
                    <option key={monthKey} value={monthKey}>
                      {group.displayDate} ({group.count} photo{group.count !== 1 ? 's' : ''})
                    </option>
                  );
                })
              )}
            </select>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600">View:</span>
          <button
            onClick={() => {
              setViewMode('daily');
              setSelectedDate('all'); // Reset filter when changing view mode
            }}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'daily' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => {
              setViewMode('monthly');
              setSelectedDate('all'); // Reset filter when changing view mode
            }}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'monthly' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      {/* Photos Grid */}
      <div className="space-y-8">
        {/* Show message if no groups are created despite having photos */}
        {photos.length > 0 && sortedDateKeys.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Date grouping issue detected</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  {photos.length} photos found but no date groups created. Check console for details.
                </p>
              </div>
            </div>
          </div>
        )}

        {viewMode === 'daily' ? (
          // Daily view - show photos grouped by individual days (Google Photos style)
          sortedDateKeys.length > 0 ? (
            sortedDateKeys.map(dateKey => {
              const group = groupedPhotos[dateKey];
              const photos = group.photos;
              const displayDate = group.displayDate;

              // Skip this date if a specific date is selected and it doesn't match
              if (selectedDate !== 'all' && selectedDate !== dateKey) {
                return null;
              }

              return (
                <div key={dateKey} className="space-y-4">
                  {/* Date Header (Google Photos style) */}
                  <div className="sticky top-0 bg-white bg-opacity-95 backdrop-blur-sm py-3 z-10 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800">{displayDate}</h3>
                        <p className="text-sm text-gray-500">{group.relativeDate} • {photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                        {dateKey}
                      </div>
                    </div>
                  </div>

                  {/* Google Photos style responsive grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-1">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="aspect-square cursor-pointer group relative overflow-hidden rounded-sm"
                        onClick={() => onPhotoClick?.(photo, photos)}
                      >
                        <AuthenticatedImage
                          src={photo.thumbnailUrl || `/api/media/${photo.id}/thumbnail`}
                          alt={photo.originalName}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        
                        {/* Hover overlay with photo info */}
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-end">
                          <div className="p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-xs font-medium truncate">{photo.originalName}</p>
                            <p className="text-xs opacity-75">
                              {(photo.sizeBytes / 1024 / 1024).toFixed(1)} MB
                            </p>
                          </div>
                        </div>

                        {/* Selection indicator (for future multi-select) */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-6 h-6 border-2 border-white rounded-full bg-black bg-opacity-30"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            // Fallback: show all photos without grouping if grouping fails
            photos.length > 0 && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-800 text-sm">
                    Showing all photos without date grouping (fallback mode)
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-1">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="aspect-square cursor-pointer group relative overflow-hidden rounded-sm"
                      onClick={() => onPhotoClick?.(photo, photos)}
                    >
                      <AuthenticatedImage
                        src={photo.thumbnailUrl || `/api/media/${photo.id}/thumbnail`}
                        alt={photo.originalName}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          )
        ) : (
          // Monthly view - show photos grouped by months
          sortedMonthKeys.map(monthKey => {
            const group = groupedByMonth[monthKey];
            const photos = group.photos;
            const displayDate = group.displayDate;

            // Skip this month if a specific month is selected and it doesn't match
            if (selectedDate !== 'all' && selectedDate !== monthKey) {
              return null;
            }

            return (
              <div key={monthKey} className="space-y-4">
                {/* Month Header */}
                <div className="sticky top-0 bg-white bg-opacity-95 backdrop-blur-sm py-3 z-10 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">{displayDate}</h3>
                      <p className="text-sm text-gray-500">{photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                      {monthKey}
                    </div>
                  </div>
                </div>

                {/* Google Photos style responsive grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-1">
                  {photos.map((photo, index) => (
                    <div
                      key={photo.id}
                      className="aspect-square cursor-pointer group relative overflow-hidden rounded-sm"
                      onClick={() => onPhotoClick?.(photo, photos)}
                    >
                      <AuthenticatedImage
                        src={photo.thumbnailUrl || `/api/media/${photo.id}/thumbnail`}
                        alt={photo.originalName}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      
                      {/* Hover overlay with photo info */}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-end">
                        <div className="p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs font-medium truncate">{photo.originalName}</p>
                          <p className="text-xs opacity-75">
                            {(photo.sizeBytes / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                      </div>

                      {/* Selection indicator (for future multi-select) */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-6 h-6 border-2 border-white rounded-full bg-black bg-opacity-30"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Load more button / Summary */}
      {photos.length > 0 && (
        <div className="text-center py-8">
          {selectedDate === 'all' ? (
            <p className="text-gray-500">
              Showing all {photos.length} photos organized by {viewMode === 'daily' ? 'day' : 'month'}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-500">
                Showing photos for {viewMode === 'daily' 
                  ? (groupedPhotos[selectedDate]?.displayDate || selectedDate)
                  : (groupedByMonth[selectedDate]?.displayDate || selectedDate)
                }
              </p>
              <button
                onClick={() => setSelectedDate('all')}
                className="text-blue-500 hover:text-blue-600 text-sm font-medium"
              >
                View all {photos.length} photos
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
