# Firebase Authentication Setup Guide for GCP Native SMS

This guide will help you set up Firebase Authentication for 100% GCP-native mobile phone verification.

## 🔥 Why Firebase Authentication?

- **100% GCP Native** - No external SMS providers needed
- **Google's SMS Infrastructure** - Global delivery, fraud protection
- **Cost Effective** - First 10,000 verifications/month FREE
- **Built-in Security** - Spam protection, rate limiting
- **Scalable** - Handles millions of verifications

## 📋 Prerequisites

1. Google Cloud Platform (GCP) account
2. Firebase project (can be created in GCP Console)
3. Node.js and npm installed
4. PostgreSQL database running

## 🚀 Setup Steps

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or use existing GCP project
3. Enable Firebase Authentication
4. In Authentication > Settings > Sign-in methods, enable "Phone"

### Step 2: Generate Service Account Key

1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate new private key"
3. Download the JSON file
4. Place it in your project directory or use environment variables

### Step 3: Configure Environment Variables

Option A - Use JSON file:
```bash
# Copy your Firebase service account JSON file
cp /path/to/your/service-account-key.json ./firebase-service-account.json

# Add to .env file
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
FIREBASE_PROJECT_ID=your-firebase-project-id
```

Option B - Use individual environment variables:
```bash
# Copy from .env.firebase and fill in your values
cp .env.firebase .env
```

### Step 4: Install Dependencies

```bash
cd backend/services/auth-service
npm install
```

### Step 5: Run Database Migration

```bash
# Run the existing migration (already created)
psql -h localhost -U taskuser -d taskmanager -f migrations/20250917000001_add_mobile_otp_support.sql
```

## 📱 API Endpoints (Firebase-Powered)

### 1. Send Phone Verification
```
POST /auth/send-phone-verification
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "countryCode": "US"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Verification initiated. SMS sent via Firebase.",
  "sessionId": "firebase-session-id",
  "expiresAt": "2024-09-17T11:00:00.000Z",
  "remainingAttempts": 2
}
```

### 2. Verify Phone and Login
```
POST /auth/verify-phone
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "otpCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "your-app-jwt-token",
  "firebaseToken": "firebase-custom-token",
  "user": {
    "id": 1,
    "phoneNumber": "+1234567890",
    "isPhoneVerified": true
  }
}
```

### 3. Register with Phone
```
POST /auth/register-phone
Content-Type: application/json

{
  "phoneNumber": "+1234567890",
  "otpCode": "123456",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com"
}
```

### 4. Verify Firebase Token (Client-side)
```
POST /auth/verify-firebase-token
Content-Type: application/json

{
  "idToken": "firebase-id-token-from-client"
}
```

## 🔒 Authentication Flow

### Client-Side Integration (Frontend)

For a complete Firebase integration, your frontend would use Firebase SDK:

```javascript
// Frontend Firebase initialization
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';

const firebaseConfig = {
  projectId: "your-firebase-project-id",
  // ... other config
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Send SMS via Firebase (100% GCP native)
const sendVerification = async (phoneNumber) => {
  const recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {}, auth);
  const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
  return confirmationResult;
};

// Verify code
const verifyCode = async (confirmationResult, code) => {
  const result = await confirmationResult.confirm(code);
  const idToken = await result.user.getIdToken();
  
  // Send idToken to your backend for verification
  return idToken;
};
```

### Backend Integration

Your backend verifies Firebase tokens and manages your app's user data:

```javascript
// Your backend receives Firebase ID token
const firebaseResult = await firebaseAuthService.verifyFirebaseToken(idToken);
if (firebaseResult.success) {
  // User is verified by Firebase
  // Create/update user in your database
  // Generate your app's JWT token
}
```

## 🌍 Global SMS Coverage

Firebase Authentication provides SMS delivery to 200+ countries through Google's infrastructure:

- **Americas**: USA, Canada, Brazil, Mexico, Argentina
- **Europe**: UK, Germany, France, Spain, Italy, Netherlands
- **Asia**: India, China, Japan, Singapore, South Korea
- **Oceania**: Australia, New Zealand
- **Africa**: South Africa, Nigeria, Kenya

## 💰 Pricing

- **First 10,000 phone verifications/month**: FREE
- **Additional verifications**: $0.006 per verification
- **No hidden fees** - only pay for successful verifications

## 🔧 Configuration Options

### Rate Limiting (Built into Firebase)
Firebase automatically handles:
- Suspicious activity detection
- Fraud prevention
- Rate limiting per phone number
- Global abuse protection

### Custom Configuration
```env
# Verification session timeout (backend managed)
VERIFICATION_TIMEOUT_MINUTES=10

# Max attempts per session
MAX_VERIFICATION_ATTEMPTS=3

# Rate limiting (backend managed)
MAX_VERIFICATIONS_PER_HOUR=5
```

## 🚨 Security Features

### Built-in Security (Firebase)
- **Fraud Detection**: ML-powered abuse prevention
- **Rate Limiting**: Automatic protection against spam
- **Phone Number Validation**: International format validation
- **Device Fingerprinting**: Additional security checks

### Your App Security
- Database-level rate limiting
- IP-based request limiting
- Audit logging
- Session management

## 🧪 Testing

### Development Mode
For testing without sending real SMS:

1. Firebase Console > Authentication > Settings > Phone
2. Add test phone numbers with verification codes
3. Use these in development

Example test numbers:
```
+1 555-0100 → Code: 123456
+1 555-0101 → Code: 654321
```

### Production Deployment
1. Ensure Firebase project is in production mode
2. Set up proper environment variables
3. Configure domain verification in Firebase Console
4. Enable billing for Firebase project

## 📊 Monitoring

### Firebase Console
- Authentication usage stats
- Success/failure rates
- Geographic distribution
- Fraud detection alerts

### Your Application
- Custom metrics with Prometheus
- Audit logs with Winston
- Health checks for Firebase connectivity

## 🆘 Troubleshooting

### Common Issues

1. **"Firebase Admin SDK not initialized"**
   - Check service account credentials
   - Verify FIREBASE_PROJECT_ID

2. **"Phone number verification failed"**
   - Ensure phone number is in E.164 format (+1234567890)
   - Check Firebase project configuration

3. **"Rate limit exceeded"**
   - Firebase has built-in rate limiting
   - Implement exponential backoff

4. **"Invalid Firebase token"**
   - Token may be expired (1 hour default)
   - Regenerate token on client side

### Debug Mode
Set `LOG_LEVEL=debug` for detailed Firebase integration logs.

## 🔄 Migration from External SMS Providers

If migrating from Twilio/AWS SNS:

1. Current OTP endpoints are replaced with Firebase endpoints
2. Database schema remains the same
3. Rate limiting logic is preserved
4. Audit logging continues to work
5. No frontend changes required (same API responses)

## 📈 Benefits Over External Providers

| Feature | Firebase Auth | Twilio | AWS SNS |
|---------|---------------|--------|---------|
| GCP Native | ✅ | ❌ | ❌ |
| Free Tier | 10,000/month | 1-10 msgs | None |
| Global Coverage | ✅ | ✅ | Limited |
| Fraud Protection | ✅ | ❌ | ❌ |
| Setup Complexity | Low | Medium | High |
| Billing Integration | GCP | Separate | AWS |

This Firebase integration provides a truly GCP-native solution for mobile authentication without any external SMS provider dependencies!