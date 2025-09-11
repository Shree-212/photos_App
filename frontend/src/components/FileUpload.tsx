'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Image from 'next/image';
import { Upload, X, AlertCircle } from 'lucide-react';
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

interface FileUploadProps {
  onUploadSuccess: (file: MediaFile) => void;
  onUploadError: (error: string) => void;
  maxFileSize?: number;
  acceptedFileTypes?: string[];
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadSuccess,
  onUploadError,
  maxFileSize = 500 * 1024 * 1024, // 500MB
  acceptedFileTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
    'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'
  ],
  className = ''
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    
    // Validate file size
    if (file.size > maxFileSize) {
      onUploadError(`File size exceeds ${Math.round(maxFileSize / (1024 * 1024))}MB limit`);
      return;
    }

    // Validate file type
    if (!acceptedFileTypes.includes(file.type)) {
      onUploadError(`File type ${file.type} is not supported`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/api/media/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        timeout: 600000, // 10 minutes for large files
        onUploadProgress: (progressEvent: any) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        }
      });

      const result = response.data;
      onUploadSuccess(result.media);
      setUploadProgress(100);
      
      // Reset progress after a short delay
      setTimeout(() => {
        setUploadProgress(0);
        setUploading(false);
      }, 1000);
      
    } catch (error) {
      console.error('Upload error:', error);
      onUploadError(error instanceof Error ? error.message : 'Upload failed');
      setUploading(false);
      setUploadProgress(0);
    }
  }, [maxFileSize, acceptedFileTypes, onUploadSuccess, onUploadError]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'image/bmp': ['.bmp'],
      'image/tiff': ['.tiff', '.tif'],
      'video/mp4': ['.mp4'],
      'video/avi': ['.avi'],
      'video/mov': ['.mov'],
      'video/wmv': ['.wmv'],
      'video/flv': ['.flv'],
      'video/webm': ['.webm'],
      'video/mkv': ['.mkv']
    },
    maxFiles: 1,
    maxSize: maxFileSize,
    disabled: uploading
  });

  return (
    <div
      {...getRootProps()}
      className={`
        relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
        ${isDragActive && !isDragReject ? 'border-blue-400 bg-blue-50' : ''}
        ${isDragReject ? 'border-red-400 bg-red-50' : ''}
        ${!isDragActive ? 'border-gray-300 hover:border-gray-400' : ''}
        ${uploading ? 'pointer-events-none opacity-50' : ''}
        ${className}
      `}
    >
      <input {...getInputProps()} />
      
      {uploading ? (
        <div className="space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600">Uploading... {Math.round(uploadProgress)}%</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <div>
            <p className="text-lg font-medium text-gray-900">
              {isDragActive ? 'Drop the file here' : 'Drag & drop an image here'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or <span className="text-blue-600 font-medium">browse files</span>
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Supports: Images (JPEG, PNG, GIF, WebP, BMP, TIFF) & Videos (MP4, AVI, MOV, WMV, WebM, MKV) - Max {Math.round(maxFileSize / (1024 * 1024))}MB
            </p>
          </div>
        </div>
      )}
      
      {isDragReject && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 rounded-lg">
          <div className="text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
            <p className="text-sm text-red-600 mt-2">File type not supported</p>
          </div>
        </div>
      )}
    </div>
  );
};

interface MediaPreviewProps {
  media: MediaFile;
  onRemove?: () => void;
  onClick?: () => void;
  showRemove?: boolean;
  className?: string;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  media,
  onRemove,
  onClick,
  showRemove = false,
  className = ''
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const isVideo = media.mimeType?.startsWith('video/');
  const isImage = media.mimeType?.startsWith('image/');

  // For videos, don't try to load thumbnail, for images use thumbnail if available
  const imageUrl = isImage && media.thumbnailUrl 
    ? media.thumbnailUrl
    : isImage 
    ? `/api/media/${media.id}/download`
    : null;

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={`relative group ${className}`}>
      <div 
        className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 cursor-pointer hover:border-gray-300 transition-colors"
        onClick={onClick}
      >
        {/* Media display */}
        <div className="aspect-square relative">
          {isVideo ? (
            // Video file - show video icon placeholder
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <div className="text-4xl mb-2">🎬</div>
                <p className="text-xs text-gray-600">Video File</p>
              </div>
            </div>
          ) : isImage && imageUrl && !imageError ? (
            // Image file - show thumbnail
            <>
              <AuthenticatedImage
                src={imageUrl}
                alt={media.originalName}
                fill
                className="object-cover"
                onLoad={() => setImageLoading(false)}
                onError={() => {
                  setImageError(true);
                  setImageLoading(false);
                }}
              />
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              )}
            </>
          ) : (
            // Error state or unknown file type
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-600">File Preview</p>
              </div>
            </div>
          )}
        </div>

        {/* Overlay with file info */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
          <p className="text-white text-xs font-medium truncate">{media.originalName}</p>
          <p className="text-white/80 text-xs">{formatFileSize(media.sizeBytes)}</p>
        </div>

        {/* Remove button */}
        {showRemove && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};
