-- Migration: Create task_media relationship table
-- Version: 20250909100001
-- Created: 2025-09-09T10:00:01.000Z

-- Create task_media table for linking tasks to media files
CREATE TABLE IF NOT EXISTS task_media (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES media_files(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, media_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_task_media_task_id ON task_media(task_id);
CREATE INDEX IF NOT EXISTS idx_task_media_media_id ON task_media(media_id);
CREATE INDEX IF NOT EXISTS idx_task_media_display_order ON task_media(task_id, display_order);
