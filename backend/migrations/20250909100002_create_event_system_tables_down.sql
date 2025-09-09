-- Rollback for: Add event system tables
-- Version: 20250909100002
-- Created: 2025-09-09T10:00:02.000Z

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_update_event_subscriptions_updated_at ON event_subscriptions;

-- Drop function
DROP FUNCTION IF EXISTS update_event_subscriptions_updated_at();

-- Drop tables
DROP TABLE IF EXISTS event_subscriptions;
DROP TABLE IF EXISTS events;
