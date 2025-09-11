-- Fix migration: Convert tasks table to albums
-- This fixes the issues in the previous migration

BEGIN;

-- Check if tables exist and create the proper migration
DO $$
BEGIN
    -- Check if tasks table exists and albums doesn't
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tasks' AND table_schema = 'public') 
       AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'albums' AND table_schema = 'public') THEN
        
        -- Rename tasks table to albums
        ALTER TABLE tasks RENAME TO albums;
        
        -- Add new columns for album-specific features
        ALTER TABLE albums ADD COLUMN IF NOT EXISTS tags TEXT[];
        ALTER TABLE albums ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'memories';
        
        -- Update existing data: convert status to tags and priority to category
        UPDATE albums SET 
            tags = ARRAY[COALESCE(status, 'general')],
            category = CASE 
                WHEN priority = 'high' THEN 'inspiration'
                WHEN priority = 'medium' THEN 'happiness'
                WHEN priority = 'low' THEN 'memories'
                ELSE 'memories'
            END
        WHERE tags IS NULL OR category IS NULL;
        
        -- Remove old columns if they exist
        ALTER TABLE albums DROP COLUMN IF EXISTS status;
        ALTER TABLE albums DROP COLUMN IF EXISTS priority;
        
        RAISE NOTICE 'Converted tasks table to albums';
    ELSE
        RAISE NOTICE 'Tasks table already converted or albums table already exists';
    END IF;

    -- Handle task_media to album_media conversion
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'task_media' AND table_schema = 'public') 
       AND NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'album_media' AND table_schema = 'public') THEN
        
        -- Rename task_media table to album_media
        ALTER TABLE task_media RENAME TO album_media;
        ALTER TABLE album_media RENAME COLUMN task_id TO album_id;
        
        RAISE NOTICE 'Converted task_media table to album_media';
    ELSE
        RAISE NOTICE 'Task_media table already converted or album_media table already exists';
    END IF;

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
    DROP TRIGGER IF EXISTS update_albums_updated_at ON albums;
    CREATE TRIGGER update_albums_updated_at BEFORE UPDATE ON albums FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Update foreign key constraints in album_media
    ALTER TABLE album_media DROP CONSTRAINT IF EXISTS task_media_task_id_fkey;
    ALTER TABLE album_media DROP CONSTRAINT IF EXISTS album_media_album_id_fkey;
    ALTER TABLE album_media ADD CONSTRAINT album_media_album_id_fkey FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

    -- Update unique constraint
    ALTER TABLE album_media DROP CONSTRAINT IF EXISTS task_media_task_id_media_id_key;
    ALTER TABLE album_media DROP CONSTRAINT IF EXISTS album_media_album_id_media_id_key;
    ALTER TABLE album_media ADD CONSTRAINT album_media_album_id_media_id_key UNIQUE(album_id, media_id);

    RAISE NOTICE 'Migration completed successfully!';
END
$$;

COMMIT;
