# Mobile Authentication API Documentation

## Overview

The mobile authentication system allows users to register and login using their mobile phone number with OTP (One-Time Password) verification. This provides a passwordless authentication experience and supports SSO functionality.

## Base URL

```
http://localhost:3001 (development)
https://your-domain.com (production)
```

## Authentication Flow

### New User Registration Flow
1. `POST /auth/send-otp` - Send OTP to phone number
2. `POST /auth/register-mobile` - Verify OTP and create account

### Existing User Login Flow
1. `POST /auth/send-otp` - Send OTP to phone number
2. `POST /auth/verify-otp` - Verify OTP and login

## Endpoints

### 1. Send OTP

Send an OTP code to the specified phone number.

**Endpoint:** `POST /auth/send-otp`

**Rate Limit:** 3 requests per 15 minutes per IP

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "countryCode": "US"
}
```

**Parameters:**
- `phoneNumber` (string, required): Phone number in international format
- `countryCode` (string, optional): ISO 3166-1 alpha-2 country code (default: "US")

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresAt": "2024-09-17T11:00:00.000Z",
  "remainingAttempts": 2
}
```

**Error Responses:**

*400 Bad Request - Invalid Input:*
```json
{
  "error": "Validation failed",
  "details": ["phoneNumber must be a valid phone number"]
}
```

*429 Too Many Requests - Rate Limited:*
```json
{
  "success": false,
  "error": "Too many OTP requests from this IP, please try again later.",
  "resetTime": "2024-09-17T11:15:00.000Z"
}
```

---

### 2. Verify OTP and Login

Verify the OTP code and authenticate the user.

**Endpoint:** `POST /auth/verify-otp`

**Rate Limit:** 10 requests per 5 minutes per IP

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "otpCode": "123456",
  "countryCode": "US"
}
```

**Parameters:**
- `phoneNumber` (string, required): Phone number in international format
- `otpCode` (string, required): 6-digit OTP code
- `countryCode` (string, optional): ISO 3166-1 alpha-2 country code (default: "US")

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "+1234567890",
    "isPhoneVerified": true,
    "createdAt": "2024-09-17T10:00:00.000Z"
  }
}
```

**Error Responses:**

*401 Unauthorized - Invalid OTP:*
```json
{
  "success": false,
  "error": "Invalid OTP code",
  "remainingAttempts": 2
}
```

*401 Unauthorized - Expired OTP:*
```json
{
  "success": false,
  "error": "OTP has expired. Please request a new one."
}
```

*401 Unauthorized - No OTP Found:*
```json
{
  "success": false,
  "error": "No OTP request found for this phone number"
}
```

---

### 3. Register with Mobile Number

Register a new user account using mobile number and OTP verification.

**Endpoint:** `POST /auth/register-mobile`

**Rate Limit:** 10 requests per 5 minutes per IP

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "otpCode": "123456",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "countryCode": "US"
}
```

**Parameters:**
- `phoneNumber` (string, required): Phone number in international format
- `otpCode` (string, required): 6-digit OTP code
- `firstName` (string, required): First name (2-50 characters, letters only)
- `lastName` (string, required): Last name (2-50 characters, letters only)
- `email` (string, optional): Email address
- `countryCode` (string, optional): ISO 3166-1 alpha-2 country code (default: "US")

**Success Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "john@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "+1234567890",
    "isPhoneVerified": true,
    "createdAt": "2024-09-17T10:00:00.000Z"
  }
}
```

**Error Responses:**

*401 Unauthorized - Invalid OTP:*
```json
{
  "success": false,
  "error": "Invalid OTP code"
}
```

*409 Conflict - Email Exists:*
```json
{
  "error": "Email already exists with another account"
}
```

---

### 4. Check Phone Number Availability

Check if a phone number is already registered and verified.

**Endpoint:** `POST /auth/check-phone`

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "countryCode": "US"
}
```

**Parameters:**
- `phoneNumber` (string, required): Phone number in international format
- `countryCode` (string, optional): ISO 3166-1 alpha-2 country code (default: "US")

**Success Response (200):**
```json
{
  "phoneNumber": "+1234567890",
  "exists": true,
  "isRegistered": true,
  "isPhoneVerified": true
}
```

**Response Fields:**
- `phoneNumber`: Formatted phone number
- `exists`: Whether the phone number exists in the database
- `isRegistered`: Whether the user has completed registration (has name/email)
- `isPhoneVerified`: Whether the phone number has been verified

---

## Error Handling

All endpoints return consistent error responses:

### Common Error Codes

- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid credentials, expired OTP)
- `409` - Conflict (resource already exists)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

### Error Response Format

```json
{
  "error": "Error message description",
  "details": ["Additional error details (if applicable)"]
}
```

## Rate Limiting

The API implements multiple layers of rate limiting:

### IP-based Rate Limits
- **Send OTP**: 3 requests per 15 minutes
- **Verify OTP**: 10 requests per 5 minutes
- **Register Mobile**: 10 requests per 5 minutes

### Phone Number Rate Limits
- **Send OTP**: 5 requests per hour per phone number
- **Verify OTP**: 3 attempts per OTP code

### Rate Limit Headers

Rate limited responses include headers:
```
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 2
X-RateLimit-Reset: 1642694400
```

## Security Features

### OTP Security
- **Length**: 6 digits
- **Expiration**: 10 minutes
- **Attempts**: Maximum 3 verification attempts per OTP
- **Generation**: Cryptographically secure random generation

### Phone Number Validation
- International format validation using libphonenumber-js
- Country code support
- Automatic formatting and normalization

### Audit Logging
All authentication attempts are logged with:
- IP address
- User agent
- Success/failure status
- Timestamp
- Reason for failure

## Authentication

After successful OTP verification, the API returns a JWT token that should be included in subsequent requests:

```
Authorization: Bearer <jwt-token>
```

The token contains:
- User ID
- Email (if available)
- First and last name
- Expiration time (24 hours by default)

## Phone Number Format

Always use international format for phone numbers:

**Correct formats:**
- `+1234567890`
- `+44 7911 123456`
- `+91 98765 43210`

**Incorrect formats:**
- `1234567890` (missing country code)
- `(123) 456-7890` (domestic format)

## Development Mode

When no SMS provider is configured, OTP codes are logged to the console for testing:

```
[INFO]: No SMS provider configured. OTP for development: { phoneNumber: '+1234567890', message: 'Your verification code is: 123456...' }
```

## Integration Examples

### JavaScript/Node.js

```javascript
// Send OTP
const sendOTP = async (phoneNumber) => {
  const response = await fetch('/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber })
  });
  return response.json();
};

// Verify OTP and login
const verifyOTP = async (phoneNumber, otpCode) => {
  const response = await fetch('/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, otpCode })
  });
  const data = await response.json();
  
  if (data.success) {
    localStorage.setItem('authToken', data.token);
  }
  
  return data;
};
```

### React Hook Example

```javascript
import { useState } from 'react';

const useMobileAuth = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendOTP = async (phoneNumber) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error);
      }
      
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (phoneNumber, otpCode) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, otpCode })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error);
      }
      
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { sendOTP, verifyOTP, loading, error };
};
```

## Testing

Use the provided test suite to verify functionality:

```bash
npm test -- mobile-auth.test.js
```

For integration testing with a real database, uncomment the integration test section and configure test database connection.