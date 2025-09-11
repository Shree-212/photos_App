'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'next/navigation';
import { AlbumForm } from '../../components/AlbumForm';
import { AlbumCard } from '../../components/AlbumCard';
import { MediaManager } from '../../components/MediaManager';
import { PhotosTab } from '../../components/PhotosTab';
import { Plus, Search, Filter, Grid, List, Upload, LogOut, Album as AlbumIcon, Image } from 'lucide-react';
import api from '../../lib/auth';
import { albumApi } from '../../lib/albums';
import toast from 'react-hot-toast';
import { Album, MediaFile, CreateAlbumData, UpdateAlbumData } from '../../types';

type ViewMode = 'grid' | 'list';
type TabType = 'albums' | 'photos';
type FilterCategory = 'all' | 'nostalgia' | 'emotions' | 'happiness' | 'pride' | 'dreams' | 'vibe' | 'inspiration' | 'memories';
type SortBy = 'createdAt' | 'title' | 'category';

export default function DashboardPage() {
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [filteredAlbums, setFilteredAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAlbumForm, setShowAlbumForm] = useState(false);
  const [showMediaManager, setShowMediaManager] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [activeTab, setActiveTab] = useState<TabType>('albums');

  useEffect(() => {
    console.log('Dashboard useEffect triggered:', { isAuthenticated, activeTab });
    
    if (!isAuthenticated) {
      console.log('User not authenticated, redirecting to login');
      router.replace('/auth/login');
      return;
    }
    
    if (activeTab === 'albums') {
      console.log('Fetching albums for authenticated user');
      refreshAlbums();
    }
  }, [isAuthenticated, activeTab]);

  // Filter and sort albums when dependencies change
  useEffect(() => {
    let filtered = [...albums].filter(album => album && typeof album === 'object');

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        album =>
          album?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          album?.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          album?.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Apply category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(album => album?.category === filterCategory);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'category':
          return a.category.localeCompare(b.category);
        case 'createdAt':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    setFilteredAlbums(filtered);
  }, [albums, searchQuery, filterCategory, sortBy]);

  const handleEditAlbum = (album: Album) => {
    console.log('Editing album:', album);
    setEditingAlbum(album);
    setShowAlbumForm(true);
  };

  const refreshAlbums = async () => {
    try {
      setLoading(true);
      console.log('Refreshing albums through API Gateway...');

      // Use the albumApi to get albums with proper typing
      const response = await albumApi.getAlbums();
      
      console.log('Albums response:', response);
      const albumsData = response.albums || [];
      const validAlbums = Array.isArray(albumsData) ? albumsData.filter(album => album && typeof album === 'object') : [];
      setAlbums(validAlbums);
    } catch (error: any) {
      console.error('Failed to fetch albums:', error);
      if (error.response?.status === 401) {
        // Token expired or invalid, redirect to login
        router.push('/auth/login');
        return;
      }
      toast.error('Failed to load albums');
      setAlbums([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAlbum = async (albumData: CreateAlbumData) => {
    try {
      console.log('Creating album with data:', albumData);
      const response = await albumApi.createAlbum(albumData);
      console.log('Album creation response:', response);
      
      setShowAlbumForm(false);
      toast.success('Album created successfully');
      
      // Refresh albums to get complete data including media
      await refreshAlbums();
    } catch (error) {
      console.error('Error creating album:', error);
      toast.error('Failed to create album');
      throw error;
    }
  };

  const handleUpdateAlbum = async (albumData: UpdateAlbumData) => {
    if (!editingAlbum) return;

    try {
      console.log('Updating album with data:', albumData);
      const response = await albumApi.updateAlbum(editingAlbum.id, albumData);
      console.log('Update response:', response);
      
      setEditingAlbum(null);
      setShowAlbumForm(false);
      toast.success('Album updated successfully');
      
      // Refresh albums to get complete updated data including media
      await refreshAlbums();
    } catch (error: any) {
      console.error('Error updating album:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      toast.error('Failed to update album');
      throw error;
    }
  };

  const handleAlbumSubmit = async (albumData: CreateAlbumData | UpdateAlbumData) => {
    if (editingAlbum) {
      return handleUpdateAlbum(albumData as UpdateAlbumData);
    } else {
      // For create, ensure title is provided
      if (!('title' in albumData) || !albumData.title) {
        throw new Error('Title is required for creating an album');
      }
      return handleCreateAlbum(albumData as CreateAlbumData);
    }
  };

  const handleDeleteAlbum = async (albumId: number) => {
    if (!confirm('Are you sure you want to delete this album?')) return;

    try {
      await albumApi.deleteAlbum(albumId);
      setAlbums(prev => prev.filter(album => album.id !== albumId));
      toast.success('Album deleted successfully');
    } catch (error) {
      console.error('Error deleting album:', error);
      toast.error('Failed to delete album');
    }
  };

  const getCategoryCount = (category: FilterCategory) => {
    if (category === 'all') return albums.length;
    return albums.filter(album => album && album.category === category).length;
  };

  if (loading && activeTab === 'albums') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Photo Albums Dashboard</h1>
              <p className="text-sm text-gray-500">
                Welcome, {user?.firstName}! {activeTab === 'albums' ? `You have ${filteredAlbums.length} of ${albums.length} albums` : 'Browse your photo collection'}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowMediaManager(true)}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                <Upload className="h-4 w-4 mr-2" />
                Media Manager
              </button>
              {activeTab === 'albums' && (
                <button
                  onClick={() => {
                    setEditingAlbum(null);
                    setShowAlbumForm(true);
                  }}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Album
                </button>
              )}
              <button
                onClick={logout}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-8 -mb-px">
            <button
              onClick={() => setActiveTab('albums')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'albums'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <AlbumIcon className="h-4 w-4 inline mr-2" />
              Albums
            </button>
            <button
              onClick={() => setActiveTab('photos')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'photos'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Image className="h-4 w-4 inline mr-2" />
              Photos
            </button>
          </div>
        </div>
      </div>

      {/* Albums Tab Content */}
      {activeTab === 'albums' && (
        <>
          {/* Filters and Controls */}
          <div className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search albums..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center space-x-4">
                  {/* Category Filter */}
                  <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-gray-400" />
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value as FilterCategory)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="all">All ({getCategoryCount('all')})</option>
                      <option value="nostalgia">Nostalgia ({getCategoryCount('nostalgia')})</option>
                      <option value="emotions">Emotions ({getCategoryCount('emotions')})</option>
                      <option value="happiness">Happiness ({getCategoryCount('happiness')})</option>
                      <option value="pride">Pride ({getCategoryCount('pride')})</option>
                      <option value="dreams">Dreams ({getCategoryCount('dreams')})</option>
                      <option value="vibe">Vibe ({getCategoryCount('vibe')})</option>
                      <option value="inspiration">Inspiration ({getCategoryCount('inspiration')})</option>
                      <option value="memories">Memories ({getCategoryCount('memories')})</option>
                    </select>
                  </div>

                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="createdAt">Sort by Date</option>
                    <option value="title">Sort by Title</option>
                    <option value="category">Sort by Category</option>
                  </select>

                  {/* View Mode */}
                  <div className="flex items-center border border-gray-300 rounded-lg">
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
          </div>

          {/* Albums Content */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredAlbums.length === 0 ? (
              <div className="text-center py-12">
                <h3 className="text-lg font-medium text-gray-900 mb-2">No albums found</h3>
                <p className="text-gray-500 mb-4">
                  {searchQuery || filterCategory !== 'all' 
                    ? 'Try adjusting your search or filters'
                    : 'Get started by creating your first album'
                  }
                </p>
                {(!searchQuery && filterCategory === 'all') && (
                  <button
                    onClick={() => {
                      setEditingAlbum(null);
                      setShowAlbumForm(true);
                    }}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Album
                  </button>
                )}
              </div>
            ) : (
              <div className={`${
                viewMode === 'grid' 
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' 
                  : 'space-y-4'
              }`}>
                {filteredAlbums.map((album) => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    onEdit={() => handleEditAlbum(album)}
                    onDelete={() => handleDeleteAlbum(album.id)}
                    className={viewMode === 'list' ? 'max-w-none' : ''}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Photos Tab Content */}
      {activeTab === 'photos' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <PhotosTab />
        </div>
      )}

      {/* Album Form Modal */}
      {showAlbumForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-white rounded-lg shadow-xl">
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingAlbum ? 'Edit Album' : 'Create New Album'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {editingAlbum ? 'Update album details and media' : 'Create a new album with photos and videos'}
                </p>
              </div>
              <AlbumForm
                album={editingAlbum || undefined}
                onSubmit={handleAlbumSubmit}
                onCancel={() => {
                  setShowAlbumForm(false);
                  setEditingAlbum(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Media Manager Modal */}
      {showMediaManager && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <MediaManager
              onSelectMedia={() => {}}
              multiSelect={false}
              showUpload={true}
              className="max-h-full overflow-auto"
            />
            <div className="bg-white border-t border-gray-200 p-4 flex justify-end">
              <button
                onClick={() => setShowMediaManager(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
