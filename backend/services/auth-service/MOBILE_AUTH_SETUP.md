# Mobile OTP Authentication Setup Guide

This guide will help you set up mobile number and OTP-based authentication for your task manager application.

## Prerequisites

1. Node.js and npm installed
2. PostgreSQL database running
3. Redis (optional, for token caching)
4. SMS provider account (Twilio or AWS SNS)

## Database Setup

1. Run the migration to add mobile authentication support:

```bash
# Navigate to the backend directory
cd backend

# Run the migration
psql -h localhost -U taskuser -d taskmanager -f migrations/20250917000001_add_mobile_otp_support.sql
```

## SMS Provider Setup

### Option 1: Twilio (Recommended for development)

1. Sign up for a Twilio account at https://www.twilio.com/
2. Get your Account SID and Auth Token from the console
3. Buy a phone number or use the trial number
4. Add these to your `.env` file:

```env
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+1234567890
```

### Option 2: AWS SNS

1. Set up an AWS account and IAM user with SNS permissions
2. Get your access key and secret key
3. Add these to your `.env` file:

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
```

## Installation

1. Install the new dependencies:

```bash
cd backend/services/auth-service
npm install
```

2. Copy and configure your environment file:

```bash
cp .env.example .env
# Edit .env with your actual configuration values
```

## API Endpoints

The following new endpoints are now available:

### 1. Send OTP
```
POST /auth/send-otp
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "countryCode": "US"
}
```

### 2. Verify OTP and Login
```
POST /auth/verify-otp
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "otpCode": "123456"
}
```

### 3. Register with Mobile Number
```
POST /auth/register-mobile
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "otpCode": "123456",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com"
}
```

### 4. Check Phone Number Availability
```
POST /auth/check-phone
Content-Type: application/json

{
  "phoneNumber": "+1234567890"
}
```

## Authentication Flow

### New User Registration with Mobile:
1. User enters phone number
2. App calls `/auth/send-otp` to send OTP
3. User enters OTP and profile details
4. App calls `/auth/register-mobile` to verify OTP and create account
5. User receives JWT token for authentication

### Existing User Login with Mobile:
1. User enters phone number
2. App calls `/auth/send-otp` to send OTP
3. User enters OTP
4. App calls `/auth/verify-otp` to verify and login
5. User receives JWT token for authentication

## Security Features

- **Rate Limiting**: Prevents OTP abuse with IP-based limits
- **Phone Validation**: Uses libphonenumber-js for proper validation
- **OTP Expiration**: OTPs expire after 10 minutes by default
- **Attempt Tracking**: Tracks and limits failed verification attempts
- **Cleanup**: Automatic cleanup of expired OTPs and old attempts

## Testing

### Development Mode
When no SMS provider is configured, OTPs will be logged to the console for testing:

```
2024-09-17T10:30:00.000Z [INFO]: No SMS provider configured. OTP for development: { phoneNumber: '+1234567890', message: 'Your verification code is: 123456...' }
```

### Production Mode
Ensure you have proper SMS provider credentials configured for production deployment.

## Rate Limits

- **Send OTP**: 3 requests per 15 minutes per IP
- **Verify OTP**: 10 attempts per 5 minutes per IP
- **Database-level**: 5 OTP sends per hour per phone number
- **OTP Verification**: 3 attempts per OTP code

## Monitoring

The service includes comprehensive logging and metrics:

- OTP send/verify attempt tracking
- Success/failure rates
- Rate limiting events
- Security audit logs

## Troubleshooting

### Common Issues:

1. **"No SMS provider configured"**: Add Twilio or AWS credentials to .env
2. **"Invalid phone number"**: Ensure phone numbers are in international format
3. **"Too many attempts"**: Wait for rate limit reset or check attempt limits
4. **"OTP expired"**: Request a new OTP code

### Debug Mode:

Set `LOG_LEVEL=debug` in your .env file for detailed logging.

## Security Considerations

1. **Environment Variables**: Never commit real credentials to version control
2. **HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Monitor and adjust rate limits based on your needs
4. **Phone Verification**: Consider implementing additional verification steps for sensitive operations
5. **Token Security**: Implement proper token refresh and revocation

## Migration from Email-only Auth

Existing users can add mobile authentication:
1. They log in with email/password
2. Add phone number to their profile
3. Verify phone number with OTP
4. Can then use either email or mobile for future logins

The system maintains backward compatibility with existing email/password authentication.