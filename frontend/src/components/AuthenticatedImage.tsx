'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import api from '../lib/auth';

interface AuthenticatedImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}

export const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({
  src,
  alt,
  fill,
  className,
  onLoad,
  onError,
  width,
  height,
  style
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchImage = async () => {
      try {
        setLoading(true);
        setError(false);
        
        // Fetch the image with authentication
        const response = await api.get(src, {
          responseType: 'blob'
        });
        
        // Create object URL from blob
        const blob = response.data;
        const objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
        
        if (onLoad) {
          onLoad();
        }
      } catch (err) {
        console.error('Failed to load authenticated image:', err);
        setError(true);
        if (onError) {
          onError();
        }
      } finally {
        setLoading(false);
      }
    };

    if (src) {
      fetchImage();
    }

    // Cleanup object URL when component unmounts
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-100 ${className}`}
        style={style}
      >
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600"></div>
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div 
        className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}
        style={style}
      >
        <span className="text-xs">Failed to load</span>
      </div>
    );
  }

  const imageProps = {
    src: imageUrl,
    alt,
    className,
    style,
    ...(fill ? { fill: true } : { width, height })
  };

  return <Image {...imageProps} />;
};
