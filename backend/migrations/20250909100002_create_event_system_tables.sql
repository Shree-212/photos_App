-- Migration: Add event system tables
-- Version: 20250909100002
-- Created: 2025-09-09T10:00:02.000Z

-- Create events table for tracking system events
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  correlation_id UUID,
  causation_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  processed_by VARCHAR(100)
);

-- Create indexes for event sourcing
CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_processed_at ON events(processed_at);

-- Create event subscriptions table for tracking which services process which events
CREATE TABLE IF NOT EXISTS event_subscriptions (
  id SERIAL PRIMARY KEY,
  service_name VARCHAR(100) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  last_processed_event_id BIGINT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(service_name, event_type)
);

-- Create index for subscriptions
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_service ON event_subscriptions(service_name, is_active);

-- Create trigger to update updated_at timestamp for subscriptions
CREATE OR REPLACE FUNCTION update_event_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_event_subscriptions_updated_at
  BEFORE UPDATE ON event_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_event_subscriptions_updated_at();
