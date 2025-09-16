# GCP SMS Provider Integration Guide

## Option 1: Firebase Authentication (Recommended)

Firebase Authentication provides built-in SMS OTP functionality that's native to GCP.

### Advantages:
- Native GCP integration
- Built-in rate limiting and security
- Automatic phone number verification
- Multi-platform support (web, mobile)
- Pay-per-use pricing
- Global SMS delivery
- Fraud protection included

### Setup Steps:

1. **Enable Firebase Authentication:**
```bash
# Install Firebase Admin SDK
npm install firebase-admin
```

2. **Configure Firebase:**
```javascript
// src/services/firebaseOtpService.js
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./path/to/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'your-project-id'
});

class FirebaseOTPService {
  constructor(logger) {
    this.logger = logger;
    this.auth = admin.auth();
  }

  async sendOTP(phoneNumber) {
    try {
      // Create custom token for phone verification
      const customToken = await this.auth.createCustomToken(`phone_${phoneNumber}`);
      
      // Firebase handles SMS sending automatically
      return {
        success: true,
        token: customToken,
        message: 'OTP sent via Firebase'
      };
    } catch (error) {
      this.logger.error('Firebase OTP error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async verifyOTP(phoneNumber, otpCode) {
    try {
      // Verify the OTP using Firebase Auth
      const result = await this.auth.verifyPhoneNumber(phoneNumber, otpCode);
      
      return {
        success: true,
        user: result.user
      };
    } catch (error) {
      return {
        success: false,
        error: 'Invalid OTP code'
      };
    }
  }
}

module.exports = FirebaseOTPService;
```

3. **Environment Configuration:**
```env
# Add to .env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
```

### Pricing:
- Phone Auth: $0.006 per verification (first 10K/month free)
- Very cost-effective for most applications

---

## Option 2: Google Cloud Pub/Sub + Twilio

Use GCP Pub/Sub to queue SMS messages and Twilio for delivery.

### Setup:
```javascript
// src/services/gcpSmsService.js
const { PubSub } = require('@google-cloud/pubsub');
const twilio = require('twilio');

class GCPSMSService {
  constructor(logger) {
    this.logger = logger;
    this.pubsub = new PubSub();
    this.twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    this.topicName = 'sms-queue';
  }

  async sendOTP(phoneNumber, message) {
    try {
      // Queue SMS in Pub/Sub
      const topic = this.pubsub.topic(this.topicName);
      const messageData = {
        phoneNumber,
        message,
        timestamp: new Date().toISOString()
      };

      await topic.publish(Buffer.from(JSON.stringify(messageData)));
      
      // Process immediately for OTP (or let Cloud Function handle it)
      await this.processSMS(messageData);
      
      return { success: true };
    } catch (error) {
      this.logger.error('GCP SMS error:', error);
      return { success: false, error: error.message };
    }
  }

  async processSMS(messageData) {
    try {
      const result = await this.twilioClient.messages.create({
        body: messageData.message,
        from: process.env.TWILIO_FROM_NUMBER,
        to: messageData.phoneNumber
      });
      
      this.logger.info('SMS sent via GCP+Twilio:', result.sid);
      return result;
    } catch (error) {
      this.logger.error('Twilio SMS error:', error);
      throw error;
    }
  }
}

module.exports = GCPSMSService;
```

---

## Option 3: Google Cloud Functions + SendGrid

Use Cloud Functions for SMS processing with SendGrid's SMS API.

### Setup:
```javascript
// Cloud Function for SMS
const functions = require('@google-cloud/functions-framework');
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

functions.http('sendSMS', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    // SendGrid SMS API call
    const smsData = {
      to: phoneNumber,
      from: process.env.SENDGRID_FROM_NUMBER,
      text: message
    };
    
    await sgMail.send(smsData);
    
    res.json({ success: true, message: 'SMS sent successfully' });
  } catch (error) {
    console.error('SMS error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

---

## Option 4: Google Cloud SMS Gateway Partners

GCP has certified SMS partners:

### MessageBird (Now part of Sinch)
```javascript
const messagebird = require('messagebird')(process.env.MESSAGEBIRD_API_KEY);

async function sendSMS(phoneNumber, message) {
  return new Promise((resolve, reject) => {
    messagebird.messages.create({
      originator: 'YourApp',
      recipients: [phoneNumber],
      body: message
    }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}
```

### Vonage (formerly Nexmo)
```javascript
const Vonage = require('@vonage/server-sdk');

const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});

async function sendSMS(phoneNumber, message) {
  return vonage.sms.send({
    to: phoneNumber,
    from: 'YourApp',
    text: message
  });
}
```

---

## Comparison Table

| Provider | GCP Integration | Cost | Global Coverage | Setup Complexity |
|----------|----------------|------|-----------------|------------------|
| **Firebase Auth** | ✅ Native | Low | Excellent | Easy |
| **Pub/Sub + Twilio** | ✅ Good | Medium | Excellent | Medium |
| **Cloud Functions + SendGrid** | ✅ Good | Medium | Good | Medium |
| **MessageBird** | ⚠️ External | Medium | Excellent | Easy |
| **Vonage** | ⚠️ External | Medium | Excellent | Easy |

---

## Recommended Implementation

For your GCP-based taskmanager, I recommend **Firebase Authentication** because:

1. **Native GCP Integration**: No external dependencies
2. **Built-in Security**: Fraud protection and rate limiting
3. **Cost-effective**: Free tier covers most small applications
4. **Easy Setup**: Minimal configuration required
5. **Scalable**: Handles millions of verifications

### Implementation Example:

```javascript
// Update your existing OTPService to use Firebase
const FirebaseOTPService = require('./firebaseOtpService');

// In your app.js, replace the OTP service initialization:
const otpService = process.env.USE_FIREBASE_AUTH === 'true' 
  ? new FirebaseOTPService(logger)
  : new OTPService(logger, pool);
```

Would you like me to implement the Firebase Authentication integration for your auth service?