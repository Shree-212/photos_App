-- Fix GCS paths for user 4's media files
-- All files for user 4 are stored in media/4/ directory

UPDATE media 
SET gcs_path = CONCAT('media/4/', filename)
WHERE user_id = 4 
  AND gcs_path NOT LIKE 'media/4/%';

-- Show the updated records
SELECT id, filename, gcs_path, user_id 
FROM media 
WHERE user_id = 4 
ORDER BY id;
