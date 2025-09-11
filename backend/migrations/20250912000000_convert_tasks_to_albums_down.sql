-- Rollback for: Convert tasks table to albums with tags and categories
-- Version: 20250912000000
-- Created: 2025-09-12T00:00:00.000Z

-- Drop new indexes
DROP INDEX IF EXISTS idx_albums_user_id;
DROP INDEX IF EXISTS idx_albums_tags;
DROP INDEX IF EXISTS idx_albums_category;
DROP INDEX IF EXISTS idx_album_media_album_id;

-- Drop trigger
DROP TRIGGER IF EXISTS update_albums_updated_at ON albums;

-- Add back old columns to albums
ALTER TABLE albums 
  ADD COLUMN status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN priority VARCHAR(20) DEFAULT 'medium';

-- Convert tags and category back to status and priority
UPDATE albums SET 
  status = CASE 
    WHEN 'pending' = ANY(tags) THEN 'pending'
    WHEN 'in-progress' = ANY(tags) THEN 'in-progress'
    WHEN 'completed' = ANY(tags) THEN 'completed'
    WHEN 'cancelled' = ANY(tags) THEN 'cancelled'
    ELSE 'pending'
  END,
  priority = CASE 
    WHEN category = 'inspiration' THEN 'high'
    WHEN category = 'happiness' THEN 'medium'
    WHEN category = 'memories' THEN 'low'
    ELSE 'medium'
  END;

-- Remove new columns
ALTER TABLE albums 
  DROP COLUMN tags,
  DROP COLUMN category;

-- Rename albums table back to tasks
ALTER TABLE albums RENAME TO tasks;

-- Rename album_media table back to task_media
ALTER TABLE album_media RENAME TO task_media;
ALTER TABLE task_media RENAME COLUMN album_id TO task_id;

-- Restore original constraints
ALTER TABLE task_media 
  DROP CONSTRAINT album_media_album_id_fkey,
  ADD CONSTRAINT task_media_task_id_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- Restore unique constraint
ALTER TABLE task_media 
  DROP CONSTRAINT album_media_album_id_media_id_key,
  ADD CONSTRAINT task_media_task_id_media_id_key UNIQUE(task_id, media_id);

-- Restore original indexes
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_task_media_task_id ON task_media(task_id);

-- Restore trigger
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
