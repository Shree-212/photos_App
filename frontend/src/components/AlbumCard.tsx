'use client';

import React, { useState } from 'react';
import { Album } from '../types';
import { format, formatDistanceToNow } from 'date-fns';
import { MediaCarousel } from './MediaCarousel';
import { AuthenticatedImage } from './AuthenticatedImage';

interface AlbumCardProps {
  album: Album;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

// Helper function to safely parse dates
const safeParseDate = (dateString: string | undefined | null): Date | null => {
  if (!dateString) return null;
  try {
    return new Date(dateString);
  } catch {
    return null;
  }
};

// Helper function to safely format distance to now
const safeFormatDistanceToNow = (dateString: string | undefined | null): string => {
  const date = safeParseDate(dateString);
  if (!date) return 'Unknown';
  try {
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return 'Unknown';
  }
};

// Helper function to safely format date
const safeFormatDate = (dateString: string | undefined | null): string => {
  const date = safeParseDate(dateString);
  if (!date) return 'Unknown';
  try {
    return format(date, 'PPP');
  } catch {
    return 'Unknown';
  }
};

const getCategoryDisplay = (category: string) => {
  const categoryMap = {
    memories: { label: 'Memories', emoji: '📸', color: 'bg-purple-100 text-purple-800' },
    nostalgia: { label: 'Nostalgia', emoji: '🕰️', color: 'bg-amber-100 text-amber-800' },
    emotions: { label: 'Emotions', emoji: '💭', color: 'bg-pink-100 text-pink-800' },
    happiness: { label: 'Happiness', emoji: '😊', color: 'bg-yellow-100 text-yellow-800' },
    pride: { label: 'Pride', emoji: '🏆', color: 'bg-gold-100 text-gold-800' },
    dreams: { label: 'Dreams', emoji: '✨', color: 'bg-indigo-100 text-indigo-800' },
    vibe: { label: 'Vibe', emoji: '🌟', color: 'bg-cyan-100 text-cyan-800' },
    inspiration: { label: 'Inspiration', emoji: '💡', color: 'bg-green-100 text-green-800' }
  };
  
  return categoryMap[category as keyof typeof categoryMap] || {
    label: category,
    emoji: '📂',
    color: 'bg-gray-100 text-gray-800'
  };
};

const getTagDisplay = (tag: string) => {
  const tagMap = {
    childhood: { emoji: '👶', color: 'bg-blue-50 text-blue-700' },
    love: { emoji: '❤️', color: 'bg-red-50 text-red-700' },
    family: { emoji: '👨‍👩‍👧‍👦', color: 'bg-green-50 text-green-700' },
    friends: { emoji: '👫', color: 'bg-yellow-50 text-yellow-700' },
    travel: { emoji: '✈️', color: 'bg-blue-50 text-blue-700' },
    nature: { emoji: '🌳', color: 'bg-green-50 text-green-700' },
    food: { emoji: '🍽️', color: 'bg-orange-50 text-orange-700' },
    celebration: { emoji: '🎉', color: 'bg-purple-50 text-purple-700' },
    work: { emoji: '💼', color: 'bg-gray-50 text-gray-700' },
    pets: { emoji: '🐕', color: 'bg-amber-50 text-amber-700' },
    hobbies: { emoji: '🎨', color: 'bg-pink-50 text-pink-700' },
    sports: { emoji: '⚽', color: 'bg-blue-50 text-blue-700' },
    art: { emoji: '🎭', color: 'bg-purple-50 text-purple-700' },
    music: { emoji: '🎵', color: 'bg-indigo-50 text-indigo-700' }
  };
  
  return tagMap[tag as keyof typeof tagMap] || {
    emoji: '🏷️',
    color: 'bg-gray-50 text-gray-700'
  };
};

export const AlbumCard: React.FC<AlbumCardProps> = ({
  album,
  onClick,
  onEdit,
  onDelete,
  className = ''
}) => {
  const [showCarousel, setShowCarousel] = useState(false);
  const categoryDisplay = getCategoryDisplay(album.category);
  const mediaCount = album.media?.length || 0;
  const hasImages = album.media?.some(m => m.mimeType.startsWith('image/'));
  const firstImage = album.media?.find(m => m.mimeType.startsWith('image/'));

  const handleCardClick = () => {
    if (mediaCount > 0) {
      setShowCarousel(true);
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <>
      <div
        className={`bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer ${className}`}
        onClick={handleCardClick}
      >
      {/* Album Cover/Preview */}
      <div className="aspect-video bg-gradient-to-br from-blue-50 to-indigo-100 rounded-t-lg overflow-hidden relative">
        {firstImage ? (
          <AuthenticatedImage
            src={firstImage.thumbnailUrl || `/api/media/${firstImage.id}/thumbnail`}
            alt={album.title}
            className="w-full h-full object-cover"
            fill
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-2">{categoryDisplay.emoji}</div>
              <div className="text-sm text-gray-500">
                {mediaCount === 0 ? 'No photos yet' : `${mediaCount} items`}
              </div>
            </div>
          </div>
        )}
        
        {/* Media count overlay */}
        {mediaCount > 0 && (
          <div className="absolute top-2 right-2">
            <span className="bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded-full">
              {mediaCount} {mediaCount === 1 ? 'item' : 'items'}
            </span>
          </div>
        )}
        
        {/* Action buttons */}
        <div className="absolute top-2 left-2 flex space-x-1">
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 p-1.5 rounded-full transition-all"
              title="Edit album"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="bg-white bg-opacity-90 hover:bg-opacity-100 text-red-600 p-1.5 rounded-full transition-all"
              title="Delete album"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Album Details */}
      <div className="p-4">
        {/* Title and Category */}
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-gray-900 text-lg leading-tight">
            {album.title}
          </h3>
          <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${categoryDisplay.color} whitespace-nowrap`}>
            {categoryDisplay.emoji} {categoryDisplay.label}
          </span>
        </div>

        {/* Description */}
        {album.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
            {album.description}
          </p>
        )}

        {/* Tags */}
        {album.tags && album.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {album.tags.slice(0, 3).map((tag) => {
              const tagDisplay = getTagDisplay(tag);
              return (
                <span
                  key={tag}
                  className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${tagDisplay.color}`}
                >
                  <span>{tagDisplay.emoji}</span>
                  <span>{tag}</span>
                </span>
              );
            })}
            {album.tags.length > 3 && (
              <span className="text-xs text-gray-500 px-2 py-1">
                +{album.tags.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span title={safeFormatDate(album.createdAt)}>
            Created {safeFormatDistanceToNow(album.createdAt)}
          </span>
          {album.updatedAt && album.updatedAt !== album.createdAt && (
            <span title={safeFormatDate(album.updatedAt)}>
              Updated {safeFormatDistanceToNow(album.updatedAt)}
            </span>
          )}
        </div>
      </div>
      </div>

      {/* Media Carousel Modal */}
      {showCarousel && album.media && album.media.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh]">
            <MediaCarousel
              media={album.media}
              initialIndex={0}
              onClose={() => setShowCarousel(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};

// Backward compatibility - TaskCard is now an alias for AlbumCard
export const TaskCard = AlbumCard;
