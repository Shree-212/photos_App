-- Migration: Convert tasks table to albums with tags and categories
-- Version: 20250912000000
-- Created: 2025-09-12T00:00:00.000Z

-- Rename tasks table to albums
ALTER TABLE tasks RENAME TO albums;

-- Add new columns for album-specific features
ALTER TABLE albums 
  ADD COLUMN tags TEXT[], -- Array of tags like 'childhood', 'love', 'family'
  ADD COLUMN category VARCHAR(50) DEFAULT 'memories'; -- Category like 'nostalgia', 'emotions', 'happiness', etc.

-- Update existing data: convert status to tags and priority to category
UPDATE albums SET 
  tags = ARRAY[status], -- Convert current status to a tag
  category = CASE 
    WHEN priority = 'high' THEN 'inspiration'
    WHEN priority = 'medium' THEN 'happiness'
    WHEN priority = 'low' THEN 'memories'
    ELSE 'memories'
  END;

-- Remove old columns
ALTER TABLE albums 
  DROP COLUMN status,
  DROP COLUMN priority;

-- Rename task_media table to album_media
ALTER TABLE task_media RENAME TO album_media;
ALTER TABLE album_media RENAME COLUMN task_id TO album_id;

-- Update indexes
DROP INDEX IF EXISTS idx_tasks_user_id;
DROP INDEX IF EXISTS idx_tasks_status;
DROP INDEX IF EXISTS idx_tasks_priority;
DROP INDEX IF EXISTS idx_task_media_task_id;

CREATE INDEX IF NOT EXISTS idx_albums_user_id ON albums(user_id);
CREATE INDEX IF NOT EXISTS idx_albums_tags ON albums USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_albums_category ON albums(category);
CREATE INDEX IF NOT EXISTS idx_album_media_album_id ON album_media(album_id);

-- Update triggers
DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_albums_updated_at BEFORE UPDATE ON albums FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update foreign key constraints in album_media
ALTER TABLE album_media 
  DROP CONSTRAINT task_media_task_id_fkey,
  ADD CONSTRAINT album_media_album_id_fkey FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

-- Update unique constraint
ALTER TABLE album_media 
  DROP CONSTRAINT task_media_task_id_media_id_key,
  ADD CONSTRAINT album_media_album_id_media_id_key UNIQUE(album_id, media_id);
