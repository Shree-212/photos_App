'use client';

import React, { useState } from 'react';
import { MediaFile } from '../types';
import { PhotosGrid } from './PhotosGrid';
import { PhotoViewer } from './PhotoViewer';

interface PhotosTabProps {
  className?: string;
}

export const PhotosTab: React.FC<PhotosTabProps> = ({ className = '' }) => {
  const [selectedPhotos, setSelectedPhotos] = useState<MediaFile[]>([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState<number>(0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const handlePhotoClick = (photo: MediaFile, allPhotos: MediaFile[]) => {
    setSelectedPhotos(allPhotos);
    const index = allPhotos.findIndex(p => p.id === photo.id);
    setCurrentPhotoIndex(Math.max(0, index));
    setIsViewerOpen(true);
  };

  const handleCloseViewer = () => {
    setIsViewerOpen(false);
    setSelectedPhotos([]);
    setCurrentPhotoIndex(0);
  };

  const handleNavigatePhoto = (index: number) => {
    setCurrentPhotoIndex(index);
  };

  return (
    <div className={className}>
      {/* Google Photos style grid */}
      <PhotosGrid
        onPhotoClick={handlePhotoClick}
        className="pb-8"
      />

      {/* Full-screen photo viewer */}
      <PhotoViewer
        photos={selectedPhotos}
        currentIndex={currentPhotoIndex}
        isOpen={isViewerOpen}
        onClose={handleCloseViewer}
        onNavigate={handleNavigatePhoto}
      />
    </div>
  );
};
