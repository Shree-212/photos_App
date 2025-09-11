-- Create albums table directly
CREATE TABLE IF NOT EXISTS albums (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    tags TEXT[],
    category VARCHAR(50) DEFAULT 'memories',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create album_media table if it doesn't exist
CREATE TABLE IF NOT EXISTS album_media (
    id SERIAL PRIMARY KEY,
    album_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(album_id, media_id)
);

-- Create media_files table if it doesn't exist
CREATE TABLE IF NOT EXISTS media_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size INTEGER NOT NULL,
    path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_albums_user_id ON albums(user_id);
CREATE INDEX IF NOT EXISTS idx_albums_tags ON albums USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_albums_category ON albums(category);
CREATE INDEX IF NOT EXISTS idx_album_media_album_id ON album_media(album_id);
CREATE INDEX IF NOT EXISTS idx_media_files_user_id ON media_files(user_id);

-- Create update trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
DROP TRIGGER IF EXISTS update_albums_updated_at ON albums;
CREATE TRIGGER update_albums_updated_at 
    BEFORE UPDATE ON albums 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add foreign key constraints
ALTER TABLE album_media 
    DROP CONSTRAINT IF EXISTS album_media_album_id_fkey,
    ADD CONSTRAINT album_media_album_id_fkey 
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE;

-- Insert some sample data
INSERT INTO albums (user_id, title, description, tags, category) VALUES
(1, 'My Childhood Memories', 'Beautiful moments from my childhood', ARRAY['childhood', 'family', 'happiness'], 'nostalgia'),
(1, 'Travel Adventures', 'Amazing places I have visited', ARRAY['travel', 'adventure', 'nature'], 'exploration'),
(1, 'Special Occasions', 'Birthdays, celebrations and special moments', ARRAY['celebration', 'birthday', 'friends'], 'happiness')
ON CONFLICT DO NOTHING;
