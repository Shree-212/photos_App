const admin = require('firebase-admin');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

class FirebaseOTPService {
  constructor(logger) {
    this.logger = logger;
    this.otpLength = 6;
    this.otpExpiryMinutes = 10;
    this.maxAttemptsPerHour = 5;
    
    this.initializeFirebase();
  }

  initializeFirebase() {
    try {
      // Initialize Firebase Admin SDK
      if (!admin.apps.length) {
        const serviceAccount = {
          type: "service_account",
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
          client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
        };

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID
        });
      }
      
      this.auth = admin.auth();
      this.logger.info('Firebase Authentication initialized successfully');
    } catch (error) {
      this.logger.error('Firebase initialization failed:', error);
      throw new Error('Failed to initialize Firebase Authentication');
    }
  }

  /**
   * Validate and format phone number
   */
  validatePhoneNumber(phoneNumber, defaultCountry = 'US') {
    try {
      const parsedNumber = parsePhoneNumberFromString(phoneNumber, defaultCountry);
      
      if (!parsedNumber || !parsedNumber.isValid()) {
        return {
          valid: false,
          error: 'Invalid phone number format'
        };
      }

      return {
        valid: true,
        formatted: parsedNumber.format('E.164'), // +1234567890
        national: parsedNumber.formatNational(),
        international: parsedNumber.formatInternational()
      };
    } catch (error) {
      this.logger.error('Phone number validation error:', error);
      return {
        valid: false,
        error: 'Phone number validation failed'
      };
    }
  }

  /**
   * Send OTP using Firebase Auth
   */
  async sendOTP(phoneNumber, ipAddress, purpose = 'verification') {
    try {
      // Validate phone number
      const phoneValidation = this.validatePhoneNumber(phoneNumber);
      if (!phoneValidation.valid) {
        return {
          success: false,
          error: phoneValidation.error
        };
      }
      
      const formattedPhone = phoneValidation.formatted;
      
      // Create a custom token for this phone verification session
      const customClaims = {
        phoneNumber: formattedPhone,
        purpose,
        timestamp: Date.now(),
        ipAddress
      };
      
      // Generate session ID for tracking
      const sessionId = `phone_${formattedPhone}_${Date.now()}`;
      
      try {
        // Create custom token (this doesn't send SMS yet)
        const customToken = await this.auth.createCustomToken(sessionId, customClaims);
        
        // Firebase will handle the SMS sending through the client SDK
        // The actual SMS is sent when the client calls Firebase Auth
        
        this.logger.info('Firebase OTP session created', { 
          phoneNumber: formattedPhone,
          sessionId,
          purpose
        });
        
        return {
          success: true,
          message: 'OTP session created. Use Firebase client SDK to send SMS.',
          sessionToken: customToken,
          sessionId,
          expiresAt: new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000).toISOString()
        };
        
      } catch (firebaseError) {
        this.logger.error('Firebase custom token creation failed:', firebaseError);
        return {
          success: false,
          error: 'Failed to create verification session'
        };
      }
      
    } catch (error) {
      this.logger.error('Send OTP error:', error);
      return {
        success: false,
        error: 'Internal server error while creating OTP session'
      };
    }
  }

  /**
   * Verify phone number using Firebase ID token
   */
  async verifyFirebaseToken(idToken, phoneNumber, ipAddress) {
    try {
      // Validate phone number format
      const phoneValidation = this.validatePhoneNumber(phoneNumber);
      if (!phoneValidation.valid) {
        return {
          success: false,
          error: phoneValidation.error
        };
      }
      
      const formattedPhone = phoneValidation.formatted;
      
      try {
        // Verify the Firebase ID token
        const decodedToken = await this.auth.verifyIdToken(idToken);
        
        // Check if the token contains phone number verification
        if (!decodedToken.phone_number) {
          return {
            success: false,
            error: 'Token does not contain phone number verification'
          };
        }
        
        // Verify the phone number matches
        if (decodedToken.phone_number !== formattedPhone) {
          return {
            success: false,
            error: 'Phone number mismatch'
          };
        }
        
        // Get or create user record in Firebase
        let userRecord;
        try {
          userRecord = await this.auth.getUser(decodedToken.uid);
        } catch (error) {
          if (error.code === 'auth/user-not-found') {
            // Create new user record
            userRecord = await this.auth.createUser({
              uid: decodedToken.uid,
              phoneNumber: formattedPhone
            });
          } else {
            throw error;
          }
        }
        
        this.logger.info('Firebase phone verification successful', {
          uid: userRecord.uid,
          phoneNumber: formattedPhone
        });
        
        return {
          success: true,
          message: 'Phone number verified successfully',
          firebaseUser: {
            uid: userRecord.uid,
            phoneNumber: userRecord.phoneNumber,
            emailVerified: userRecord.emailVerified,
            disabled: userRecord.disabled,
            metadata: {
              creationTime: userRecord.metadata.creationTime,
              lastSignInTime: userRecord.metadata.lastSignInTime
            }
          }
        };
        
      } catch (firebaseError) {
        this.logger.error('Firebase token verification failed:', firebaseError);
        
        if (firebaseError.code === 'auth/id-token-expired') {
          return {
            success: false,
            error: 'Verification token has expired'
          };
        } else if (firebaseError.code === 'auth/invalid-id-token') {
          return {
            success: false,
            error: 'Invalid verification token'
          };
        }
        
        return {
          success: false,
          error: 'Token verification failed'
        };
      }
      
    } catch (error) {
      this.logger.error('Verify Firebase token error:', error);
      return {
        success: false,
        error: 'Internal server error while verifying token'
      };
    }
  }

  /**
   * Get user by phone number
   */
  async getUserByPhoneNumber(phoneNumber) {
    try {
      const phoneValidation = this.validatePhoneNumber(phoneNumber);
      if (!phoneValidation.valid) {
        return {
          success: false,
          error: phoneValidation.error
        };
      }
      
      const formattedPhone = phoneValidation.formatted;
      
      try {
        const userRecord = await this.auth.getUserByPhoneNumber(formattedPhone);
        
        return {
          success: true,
          user: {
            uid: userRecord.uid,
            phoneNumber: userRecord.phoneNumber,
            email: userRecord.email,
            emailVerified: userRecord.emailVerified,
            displayName: userRecord.displayName,
            disabled: userRecord.disabled,
            metadata: {
              creationTime: userRecord.metadata.creationTime,
              lastSignInTime: userRecord.metadata.lastSignInTime
            }
          }
        };
        
      } catch (firebaseError) {
        if (firebaseError.code === 'auth/user-not-found') {
          return {
            success: false,
            error: 'No user found with this phone number'
          };
        }
        
        throw firebaseError;
      }
      
    } catch (error) {
      this.logger.error('Get user by phone error:', error);
      return {
        success: false,
        error: 'Internal server error while fetching user'
      };
    }
  }

  /**
   * Create or update user with additional profile information
   */
  async updateUserProfile(uid, profileData) {
    try {
      const updateData = {};
      
      if (profileData.email) {
        updateData.email = profileData.email;
      }
      
      if (profileData.displayName) {
        updateData.displayName = profileData.displayName;
      }
      
      if (profileData.emailVerified !== undefined) {
        updateData.emailVerified = profileData.emailVerified;
      }
      
      const userRecord = await this.auth.updateUser(uid, updateData);
      
      return {
        success: true,
        user: {
          uid: userRecord.uid,
          phoneNumber: userRecord.phoneNumber,
          email: userRecord.email,
          emailVerified: userRecord.emailVerified,
          displayName: userRecord.displayName,
          disabled: userRecord.disabled
        }
      };
      
    } catch (error) {
      this.logger.error('Update user profile error:', error);
      return {
        success: false,
        error: 'Failed to update user profile'
      };
    }
  }

  /**
   * Disable user account
   */
  async disableUser(uid) {
    try {
      await this.auth.updateUser(uid, { disabled: true });
      return { success: true };
    } catch (error) {
      this.logger.error('Disable user error:', error);
      return {
        success: false,
        error: 'Failed to disable user'
      };
    }
  }

  /**
   * Delete user account
   */
  async deleteUser(uid) {
    try {
      await this.auth.deleteUser(uid);
      return { success: true };
    } catch (error) {
      this.logger.error('Delete user error:', error);
      return {
        success: false,
        error: 'Failed to delete user'
      };
    }
  }

  /**
   * Cleanup method (Firebase handles cleanup automatically)
   */
  async cleanup() {
    // Firebase handles cleanup automatically
    this.logger.info('Firebase cleanup not required - handled automatically');
    return 0;
  }
}

module.exports = FirebaseOTPService;