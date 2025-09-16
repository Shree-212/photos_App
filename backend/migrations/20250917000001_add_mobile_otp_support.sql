-- Migration: Add mobile number and OTP support to users table
-- Version: 20250917000001
-- Description: Add mobile authentication and OTP verification capabilities

-- Add mobile and OTP related columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS failed_otp_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_otp_request TIMESTAMP;

-- Create index for phone number lookups
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_otp_expires ON users(otp_expires_at);

-- Create OTP attempts tracking table for additional rate limiting
CREATE TABLE IF NOT EXISTS otp_attempts (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(20) NOT NULL,
    ip_address INET NOT NULL,
    attempt_type VARCHAR(20) NOT NULL, -- 'send' or 'verify'
    success BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for OTP attempts table
CREATE INDEX IF NOT EXISTS idx_otp_attempts_phone ON otp_attempts(phone_number);
CREATE INDEX IF NOT EXISTS idx_otp_attempts_ip ON otp_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_otp_attempts_created ON otp_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_otp_attempts_type ON otp_attempts(attempt_type);

-- Create function to clean up old OTP attempts (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_otp_attempts()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM otp_attempts 
    WHERE created_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Also cleanup expired OTP codes from users table
    UPDATE users 
    SET otp_code = NULL, 
        otp_expires_at = NULL 
    WHERE otp_expires_at < NOW();
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get OTP attempt count for rate limiting
CREATE OR REPLACE FUNCTION get_otp_attempt_count(
    p_phone_number VARCHAR(20), 
    p_ip_address INET, 
    p_attempt_type VARCHAR(20), 
    p_time_window INTERVAL DEFAULT INTERVAL '15 minutes'
)
RETURNS INTEGER AS $$
DECLARE
    attempt_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO attempt_count
    FROM otp_attempts 
    WHERE (phone_number = p_phone_number OR ip_address = p_ip_address)
    AND attempt_type = p_attempt_type
    AND created_at > NOW() - p_time_window;
    
    RETURN attempt_count;
END;
$$ LANGUAGE plpgsql;

-- Insert migration record
INSERT INTO migration_history (version, description, executed_at) 
VALUES ('20250917000001', 'Add mobile number and OTP support to users table', NOW())
ON CONFLICT (version) DO NOTHING;

-- Comments for documentation
COMMENT ON COLUMN users.phone_number IS 'User mobile phone number in international format (+1234567890)';
COMMENT ON COLUMN users.is_phone_verified IS 'Whether the phone number has been verified via OTP';
COMMENT ON COLUMN users.otp_code IS 'Current OTP code for verification (temporary storage)';
COMMENT ON COLUMN users.otp_expires_at IS 'Expiration timestamp for the current OTP code';
COMMENT ON COLUMN users.failed_otp_attempts IS 'Counter for failed OTP verification attempts';
COMMENT ON COLUMN users.last_otp_request IS 'Timestamp of last OTP request for rate limiting';

COMMENT ON TABLE otp_attempts IS 'Tracking table for OTP send/verify attempts for security and rate limiting';