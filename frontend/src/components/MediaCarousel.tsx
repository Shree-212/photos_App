'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X, Download, Eye, Play } from 'lucide-react';
import api from '../lib/auth';
import { AuthenticatedImage } from './AuthenticatedImage';

interface MediaFile {
  id: number;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  createdAt: string;
}

interface MediaCarouselProps {
  media: MediaFile[];
  initialIndex?: number;
  onClose?: () => void;
  className?: string;
}

// Helper component for authenticated video
const AuthenticatedVideo: React.FC<{
  src: string;
  className?: string;
  controls?: boolean;
  poster?: string;
}> = ({ src, className, controls = true, poster }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  React.useEffect(() => {
    const fetchVideo = async () => {
      try {
        setLoading(true);
        setError(false);
        
        const response = await api.get(src, {
          responseType: 'blob',
          timeout: 30000 // 30 second timeout for videos
        });
        
        const blob = response.data;
        const objectUrl = URL.createObjectURL(blob);
        setVideoUrl(objectUrl);
      } catch (err) {
        console.error('Failed to load authenticated video:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (src) {
      fetchVideo();
    }

    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600"></div>
      </div>
    );
  }

  if (error || !videoUrl) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}>
        <div className="text-center">
          <Play className="h-8 w-8 mx-auto mb-2" />
          <span className="text-sm">Failed to load video</span>
        </div>
      </div>
    );
  }

  return (
    <video 
      src={videoUrl} 
      className={className}
      controls={controls}
      poster={poster}
      preload="metadata"
    >
      Your browser does not support the video tag.
    </video>
  );
};

// Helper component for media preview in thumbnails
const MediaPreview: React.FC<{
  media: MediaFile;
  className?: string;
  width?: number;
  height?: number;
}> = ({ media, className, width = 64, height = 64 }) => {
  const isVideo = media.mimeType.startsWith('video/');
  
  if (isVideo) {
    return (
      <div className={`relative ${className}`}>
        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
          <Play className="h-4 w-4 text-white" />
        </div>
        <span className="absolute bottom-0 right-0 bg-black/70 text-white text-xs px-1 rounded-tl">
          🎬
        </span>
      </div>
    );
  }

  // For images, try thumbnail first, fall back to full image
  const imageUrl = media.thumbnailUrl 
    ? media.thumbnailUrl 
    : `/api/media/${media.id}/download`;

  return (
    <AuthenticatedImage
      src={imageUrl}
      alt={media.originalName}
      width={width}
      height={height}
      className={className}
    />
  );
};

export const MediaCarousel: React.FC<MediaCarouselProps> = ({
  media,
  initialIndex = 0,
  onClose,
  className = ''
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  if (media.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No media files to display</p>
      </div>
    );
  }

  const currentMedia = media[currentIndex];
  const isCurrentVideo = currentMedia.mimeType.startsWith('video/');
  const mediaUrl = `/api/media/${currentMedia.id}/download`;

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? media.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === media.length - 1 ? 0 : prev + 1));
  };

  const goToIndex = (index: number) => {
    setCurrentIndex(index);
  };

  const handleDownload = async () => {
    try {
      const response = await api.get(`/api/media/${currentMedia.id}/download`, {
        responseType: 'blob'
      });
      
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentMedia.originalName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        {/* Fullscreen header */}
        <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/50 to-transparent p-4">
          <div className="flex items-center justify-between text-white">
            <div>
              <h3 className="font-medium">{currentMedia.originalName}</h3>
              <p className="text-sm text-white/80">
                {currentIndex + 1} of {media.length} • {isCurrentVideo ? 'Video' : 'Image'}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDownload}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <Download className="h-5 w-5" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Fullscreen media */}
        <div className="relative w-full h-full flex items-center justify-center">
          {isCurrentVideo ? (
            <AuthenticatedVideo
              src={mediaUrl}
              className="max-w-full max-h-full"
              controls
            />
          ) : (
            <AuthenticatedImage
              src={mediaUrl}
              alt={currentMedia.originalName}
              fill
              className="object-contain"
            />
          )}
        </div>

        {/* Fullscreen navigation */}
        {media.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        {/* Fullscreen thumbnails */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-4">
          <div className="flex justify-center space-x-2 overflow-x-auto">
            {media.map((item, index) => (
              <button
                key={item.id}
                onClick={() => goToIndex(index)}
                className={`flex-shrink-0 w-12 h-12 rounded border-2 overflow-hidden ${
                  index === currentIndex ? 'border-white' : 'border-white/30'
                }`}
              >
                <MediaPreview
                  media={item}
                  className="w-full h-full object-cover"
                  width={48}
                  height={48}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg overflow-hidden ${className}`} ref={carouselRef}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="font-semibold text-gray-900">{currentMedia.originalName}</h3>
          <p className="text-sm text-gray-500">
            {currentIndex + 1} of {media.length} • {formatFileSize(currentMedia.sizeBytes)} • {isCurrentVideo ? 'Video' : 'Image'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleFullscreen}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="View fullscreen"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main media */}
      <div className="relative aspect-video bg-gray-100">
        {isCurrentVideo ? (
          <AuthenticatedVideo
            src={mediaUrl}
            className="w-full h-full object-contain"
            controls
          />
        ) : (
          <AuthenticatedImage
            src={mediaUrl}
            alt={currentMedia.originalName}
            fill
            className="object-contain"
          />
        )}
        
        {/* Navigation arrows */}
        {media.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 transform -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Index indicator */}
        {media.length > 1 && (
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black/50 text-white px-2 py-1 rounded text-xs">
            {currentIndex + 1} / {media.length}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {media.length > 1 && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex space-x-2 overflow-x-auto">
            {media.map((item, index) => (
              <button
                key={item.id}
                onClick={() => goToIndex(index)}
                className={`flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden transition-colors ${
                  index === currentIndex 
                    ? 'border-blue-500' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <MediaPreview
                  media={item}
                  className="w-full h-full object-cover"
                  width={64}
                  height={64}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="p-4 bg-gray-50 text-sm text-gray-600">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="font-medium">File type:</span> {currentMedia.mimeType}
          </div>
          <div>
            <span className="font-medium">Uploaded:</span> {formatDate(currentMedia.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
};
