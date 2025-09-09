'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useRouter } from 'next/navigation';
import { TaskForm } from '../../components/TaskForm';
import { TaskCard } from '../../components/TaskCard';
import { MediaManager } from '../../components/MediaManager';
import { Plus, Search, Filter, Grid, List, Upload, LogOut } from 'lucide-react';
import api from '../../lib/auth';
import { taskApi } from '../../lib/tasks';
import toast from 'react-hot-toast';
import { Task, MediaFile, CreateTaskData, UpdateTaskData } from '../../types';

type ViewMode = 'grid' | 'list';
type FilterStatus = 'all' | 'pending' | 'in-progress' | 'completed' | 'cancelled';
type SortBy = 'createdAt' | 'title' | 'priority' | 'status';

export default function DashboardPage() {
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showMediaManager, setShowMediaManager] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    fetchTasks();
  }, [isAuthenticated, router]);

  // Filter and sort tasks when dependencies change
  useEffect(() => {
    let filtered = [...tasks].filter(task => task && typeof task === 'object');

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        task =>
          task?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          task?.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(task => task?.status === filterStatus);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case 'status':
          return a.status.localeCompare(b.status);
        case 'createdAt':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    setFilteredTasks(filtered);
  }, [tasks, searchQuery, filterStatus, sortBy]);

  const handleEditTask = (task: Task) => {
    console.log('Editing task:', task);
    setEditingTask(task);
    setShowTaskForm(true);
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      console.log('Fetching tasks through API Gateway...');

      // Use the taskApi to get tasks with proper typing
      const response = await taskApi.getTasks();
      
      console.log('Tasks response:', response);
      const tasksData = response.tasks || [];
      const validTasks = Array.isArray(tasksData) ? tasksData.filter(task => task && typeof task === 'object' && task.status) : [];
      setTasks(validTasks);
    } catch (error: any) {
      console.error('Failed to fetch tasks:', error);
      if (error.response?.status === 401) {
        // Token expired or invalid, redirect to login
        router.push('/auth/login');
        return;
      }
      toast.error('Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (taskData: CreateTaskData) => {
    try {
      const response = await taskApi.createTask(taskData);
      const newTask = response.task;
      setTasks(prev => [newTask, ...prev]);
      setShowTaskForm(false);
      toast.success('Task created successfully');
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
      throw error;
    }
  };

  const handleUpdateTask = async (taskData: UpdateTaskData) => {
    if (!editingTask) return;

    try {
      console.log('Updating task with data:', taskData);
      const response = await taskApi.updateTask(editingTask.id, taskData);
      console.log('Update response:', response);
      const updatedTask = response.task;
      setTasks(prev => prev.map(task => task.id === editingTask.id ? updatedTask : task));
      setEditingTask(null);
      setShowTaskForm(false);
      toast.success('Task updated successfully');
    } catch (error: any) {
      console.error('Error updating task:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      toast.error('Failed to update task');
      throw error;
    }
  };

  const handleTaskSubmit = async (taskData: CreateTaskData | UpdateTaskData) => {
    if (editingTask) {
      return handleUpdateTask(taskData as UpdateTaskData);
    } else {
      return handleCreateTask(taskData as CreateTaskData);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      await taskApi.deleteTask(taskId);
      setTasks(prev => prev.filter(task => task.id !== taskId));
      toast.success('Task deleted successfully');
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const handleStatusChange = async (taskId: number, status: Task['status']) => {
    try {
      const response = await api.patch(`/api/tasks/${taskId}/status`, { status });
      const updatedTask = response.data.data || response.data;
      setTasks(prev => prev.map(task => task.id === taskId ? updatedTask : task));
      toast.success('Task status updated');
    } catch (error) {
      console.error('Error updating task status:', error);
      toast.error('Failed to update task status');
    }
  };

  const getStatusCount = (status: FilterStatus) => {
    if (status === 'all') return tasks.length;
    return tasks.filter(task => task && task.status === status).length;
  };

  if (loading) {
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
              <h1 className="text-2xl font-bold text-gray-900">Task Manager Dashboard</h1>
              <p className="text-sm text-gray-500">
                Welcome, {user?.firstName}! You have {filteredTasks.length} of {tasks.length} tasks
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
              <button
                onClick={() => {
                  setEditingTask(null);
                  setShowTaskForm(true);
                }}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </button>
              <button
                onClick={logout}
                className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center space-x-4">
              {/* Status Filter */}
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All ({getStatusCount('all')})</option>
                  <option value="pending">Pending ({getStatusCount('pending')})</option>
                  <option value="in-progress">In Progress ({getStatusCount('in-progress')})</option>
                  <option value="completed">Completed ({getStatusCount('completed')})</option>
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
                <option value="priority">Sort by Priority</option>
                <option value="status">Sort by Status</option>
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks found</h3>
            <p className="text-gray-500 mb-4">
              {searchQuery || filterStatus !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Get started by creating your first task'
              }
            </p>
            {(!searchQuery && filterStatus === 'all') && (
              <button
                onClick={() => {
                  setEditingTask(null);
                  setShowTaskForm(true);
                }}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Task
              </button>
            )}
          </div>
        ) : (
          <div className={`${
            viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' 
              : 'space-y-4'
          }`}>
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
                onStatusChange={handleStatusChange}
                compact={viewMode === 'list'}
                className={viewMode === 'list' ? 'max-w-none' : ''}
              />
            ))}
          </div>
        )}
      </div>

      {/* Task Form Modal */}
      {showTaskForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto">
            <TaskForm
              task={editingTask || undefined}
              onSubmit={handleTaskSubmit}
              onCancel={() => {
                setShowTaskForm(false);
                setEditingTask(null);
              }}
            />
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
