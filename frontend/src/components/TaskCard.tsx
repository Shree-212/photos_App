'use client';

import React, { useState } from 'react';
import { MediaCarousel } from './MediaCarousel';
import { AuthenticatedImage } from './AuthenticatedImage';
import { 
  Calendar, 
  User, 
  MoreVertical, 
  Edit3, 
  Trash2, 
  Eye,
  Paperclip,
  Clock,
  Flag
} from 'lucide-react';
import { format, formatDistanceToNow, isValid } from 'date-fns';
import { Task, MediaFile } from '../types';

// Helper function to safely parse dates
const safeParseDate = (dateString: string | undefined | null): Date | null => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return isValid(date) ? date : null;
};

// Helper function to safely format distance to now
const safeFormatDistanceToNow = (dateString: string | undefined | null): string => {
  const date = safeParseDate(dateString);
  if (!date) return 'Unknown';
  return formatDistanceToNow(date, { addSuffix: true });
};

// Helper function to safely format date
const safeFormatDate = (dateString: string | undefined | null, formatStr: string = 'MMM d, yyyy'): string => {
  const date = safeParseDate(dateString);
  if (!date) return 'Invalid date';
  return format(date, formatStr);
};

// Helper function to safely check if date is overdue
const isDateOverdue = (dateString: string | undefined | null, status: string): boolean => {
  if (!dateString || status === 'completed') return false;
  const date = safeParseDate(dateString);
  return date ? date < new Date() : false;
};

interface TaskCardProps {
  task: Task;
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: number) => void;
  onView?: (task: Task) => void;
  onStatusChange?: (taskId: number, status: Task['status']) => void;
  className?: string;
  showActions?: boolean;
  compact?: boolean;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onEdit,
  onDelete,
  onView,
  onStatusChange,
  className = '',
  showActions = true,
  compact = false
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMediaCarousel, setShowMediaCarousel] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'in-progress': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'completed': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'text-green-600';
      case 'medium': return 'text-yellow-600';
      case 'high': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getPriorityIcon = (priority: string) => {
    const baseClasses = "h-4 w-4";
    const colorClasses = getPriorityColor(priority);
    return <Flag className={`${baseClasses} ${colorClasses}`} />;
  };

  const handleMediaClick = (index: number) => {
    setCarouselIndex(index);
    setShowMediaCarousel(true);
  };

  const handleStatusClick = () => {
    if (!onStatusChange) return;
    
    const statusOrder = ['pending', 'in-progress', 'completed', 'cancelled'] as const;
    const currentIndex = statusOrder.indexOf(task.status);
    const nextIndex = (currentIndex + 1) % statusOrder.length;
    
    onStatusChange(task.id, statusOrder[nextIndex]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isOverdue = isDateOverdue(task.dueDate, task.status);

  return (
    <>
      <div className={`bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow ${className}`}>
        {/* Header */}
        <div className="p-4 pb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h3 
                className="text-lg font-semibold text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                onClick={() => onView?.(task)}
                title={task.title}
              >
                {task.title}
              </h3>
              
              {/* Status and Priority */}
              <div className="flex items-center space-x-2 mt-2">
                <button
                  onClick={handleStatusClick}
                  disabled={!onStatusChange}
                  className={`inline-flex px-2 py-1 text-xs font-medium rounded-full border transition-colors ${
                    onStatusChange ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                  } ${getStatusColor(task.status)}`}
                >
                  {task.status.charAt(0).toUpperCase() + task.status.slice(1).replace('-', ' ')}
                </button>
                
                <div className="flex items-center space-x-1">
                  {getPriorityIcon(task.priority)}
                  <span className={`text-xs font-medium ${getPriorityColor(task.priority)}`}>
                    {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                  </span>
                </div>

                {task.media && task.media.length > 0 && (
                  <div className="flex items-center space-x-1 text-gray-500">
                    <Paperclip className="h-3 w-3" />
                    <span className="text-xs">{task.media.length}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {showActions && (
              <div className="relative ml-4 z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDropdown(!showDropdown);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors relative z-10"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {showDropdown && (
                  <>
                    <div className="absolute right-0 top-6 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
                      {onView && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onView(task);
                            setShowDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                        >
                          <Eye className="h-4 w-4 mr-3" />
                          View Details
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(task);
                            setShowDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                        >
                          <Edit3 className="h-4 w-4 mr-3" />
                          Edit Task
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(task.id);
                            setShowDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center"
                        >
                          <Trash2 className="h-4 w-4 mr-3" />
                          Delete Task
                        </button>
                      )}
                    </div>
                    {/* Click Outside Handler */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowDropdown(false)}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        {!compact && task.description && (
          <div className="px-4 pb-2">
            <p className="text-gray-600 text-sm line-clamp-3">{task.description}</p>
          </div>
        )}

        {/* Media Attachments */}
        {task.media && task.media.length > 0 && (
          <div className="px-4 pb-2">
            <div className="text-xs font-medium text-gray-700 mb-2">
              Attachments ({task.media.length})
            </div>
            <div className="flex space-x-2 overflow-x-auto">
              {task.media.slice(0, compact ? 3 : 6).map((media, index) => (
                <div
                  key={media.id}
                  className="flex-shrink-0 w-16 h-16 rounded-lg border border-gray-200 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => handleMediaClick(index)}
                >
                  {media.mimeType.startsWith('image/') ? (
                    <AuthenticatedImage
                      src={media.thumbnailUrl || `/api/media/${media.id}/thumbnail`}
                      alt={media.originalName}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                    />
                  ) : media.mimeType.startsWith('video/') ? (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center relative">
                      <div className="text-white text-center">
                        <div className="w-6 h-6 mx-auto mb-1 flex items-center justify-center">
                          🎬
                        </div>
                        <div className="text-xs opacity-75">Video</div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <Paperclip className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                </div>
              ))}
              {task.media.length > (compact ? 3 : 6) && (
                <div className="flex-shrink-0 w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-xs text-gray-500 font-medium">
                  +{task.media.length - (compact ? 3 : 6)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              {/* Created Date */}
              <div className="flex items-center space-x-1">
                <Calendar className="h-3 w-3" />
                <span>Created {safeFormatDistanceToNow(task.createdAt)}</span>
              </div>

              {/* Assigned User */}
              {task.assignedTo && (
                <div className="flex items-center space-x-1">
                  <User className="h-3 w-3" />
                  <span>{task.assignedTo.name}</span>
                </div>
              )}
            </div>

            {/* Due Date */}
            {task.dueDate && (
              <div className={`flex items-center space-x-1 ${isOverdue ? 'text-red-600' : ''}`}>
                <Clock className="h-3 w-3" />
                <span>
                  Due {safeFormatDate(task.dueDate)}
                  {isOverdue && ' (Overdue)'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media Carousel Modal */}
      {showMediaCarousel && task.media && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[90vh]">
            <MediaCarousel
              media={task.media}
              initialIndex={carouselIndex}
              onClose={() => setShowMediaCarousel(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};
