-- Rollback for: Create media_files table
-- Version: 20250909100000
-- Created: 2025-09-09T10:00:00.000Z

-- Drop trigger first
DROP TRIGGER IF EXISTS trigger_update_media_files_updated_at ON media_files;

-- Drop function
DROP FUNCTION IF EXISTS update_media_files_updated_at();

-- Drop table
DROP TABLE IF EXISTS media_files;
