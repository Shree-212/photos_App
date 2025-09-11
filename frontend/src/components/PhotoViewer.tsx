'use client';

import React, { useState, useEffect } from 'react';
import { MediaFile } from '../types';
import { AuthenticatedImage } from './AuthenticatedImage';

interface PhotoViewerProps {
  photos: MediaFile[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (index: number) => void;
}

export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  photos,
  currentIndex,
  isOpen,
  onClose,
  onNavigate
}) => {
  const [currentPhoto, setCurrentPhoto] = useState<MediaFile | null>(null);

  useEffect(() => {
    if (photos.length > 0 && currentIndex >= 0 && currentIndex < photos.length) {
      setCurrentPhoto(photos[currentIndex]);
    }
  }, [photos, currentIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) {
            onNavigate?.(currentIndex - 1);
          }
          break;
        case 'ArrowRight':
          if (currentIndex < photos.length - 1) {
            onNavigate?.(currentIndex + 1);
          }
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, currentIndex, photos.length, onClose, onNavigate]);

  if (!isOpen || !currentPhoto) {
    return null;
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      onNavigate?.(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < photos.length - 1) {
      onNavigate?.(currentIndex + 1);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black to-transparent p-4">
        <div className="flex items-center justify-between text-white">
          <div>
            <h3 className="font-medium">{currentPhoto.originalName}</h3>
            <p className="text-sm opacity-75">
              {currentIndex + 1} of {photos.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Image */}
      <div className="relative max-w-full max-h-full flex items-center justify-center p-16">
        <AuthenticatedImage
          src={`/api/media/${currentPhoto.id}`}
          alt={currentPhoto.originalName}
          className="max-w-full max-h-full object-contain"
        />
      </div>

      {/* Navigation Arrows */}
      {currentIndex > 0 && (
        <button
          onClick={handlePrevious}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 p-3 bg-black bg-opacity-50 hover:bg-opacity-70 rounded-full text-white transition-all"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {currentIndex < photos.length - 1 && (
        <button
          onClick={handleNext}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 p-3 bg-black bg-opacity-50 hover:bg-opacity-70 rounded-full text-white transition-all"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Bottom Info Panel */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4">
        <div className="text-white max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="opacity-75">Upload Date</p>
              <p>{formatDate(currentPhoto.createdAt)}</p>
            </div>
            <div>
              <p className="opacity-75">File Size</p>
              <p>{formatFileSize(currentPhoto.sizeBytes)}</p>
            </div>
            <div>
              <p className="opacity-75">File Type</p>
              <p>{currentPhoto.mimeType}</p>
            </div>
          </div>

          {/* Thumbnail strip */}
          {photos.length > 1 && (
            <div className="mt-4 flex space-x-2 overflow-x-auto pb-2">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  onClick={() => onNavigate?.(index)}
                  className={`flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition-all ${
                    index === currentIndex
                      ? 'border-white'
                      : 'border-transparent opacity-60 hover:opacity-80'
                  }`}
                >
                  <AuthenticatedImage
                    src={photo.thumbnailUrl || `/api/media/${photo.id}/thumbnail`}
                    alt={photo.originalName}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close */}
      <div
        className="absolute inset-0 -z-10"
        onClick={onClose}
      />
    </div>
  );
};
