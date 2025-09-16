const crypto = require('crypto');
const { authenticator } = require('otplib');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const twilio = require('twilio');
const AWS = require('aws-sdk');

class OTPService {
  constructor(logger, pool) {
    this.logger = logger;
    this.pool = pool;
    this.otpLength = 6;
    this.otpExpiryMinutes = 10;
    this.maxAttemptsPerHour = 5;
    this.maxVerifyAttemptsPerOtp = 3;
    
    // Initialize SMS providers
    this.initializeSMSProviders();
  }

  initializeSMSProviders() {
    // Initialize Twilio
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      this.twilioFromNumber = process.env.TWILIO_FROM_NUMBER;
      this.logger.info('Twilio SMS provider initialized');
    }

    // Initialize AWS SNS
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      AWS.config.update({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || 'us-east-1'
      });
      this.snsClient = new AWS.SNS();
      this.logger.info('AWS SNS SMS provider initialized');
    }

    if (!this.twilioClient && !this.snsClient) {
      this.logger.warn('No SMS providers configured. OTP will be logged only.');
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
   * Generate a secure OTP code
   */
  generateOTP() {
    const digits = '0123456789';
    let otp = '';
    
    for (let i = 0; i < this.otpLength; i++) {
      const randomIndex = crypto.randomInt(0, digits.length);
      otp += digits[randomIndex];
    }
    
    return otp;
  }

  /**
   * Check rate limits for OTP requests
   */
  async checkRateLimit(phoneNumber, ipAddress, attemptType) {
    try {
      const result = await this.pool.query(
        'SELECT get_otp_attempt_count($1, $2, $3, $4) as attempt_count',
        [phoneNumber, ipAddress, attemptType, '1 hour']
      );
      
      const attemptCount = parseInt(result.rows[0].attempt_count);
      const limit = attemptType === 'send' ? this.maxAttemptsPerHour : this.maxVerifyAttemptsPerOtp;
      
      if (attemptCount >= limit) {
        return {
          allowed: false,
          remainingAttempts: 0,
          resetTime: new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
        };
      }
      
      return {
        allowed: true,
        remainingAttempts: limit - attemptCount,
        resetTime: null
      };
    } catch (error) {
      this.logger.error('Rate limit check error:', error);
      // On error, allow the request but log it
      return { allowed: true, remainingAttempts: this.maxAttemptsPerHour };
    }
  }

  /**
   * Log OTP attempt for rate limiting
   */
  async logOTPAttempt(phoneNumber, ipAddress, attemptType, success = false) {
    try {
      await this.pool.query(
        'INSERT INTO otp_attempts (phone_number, ip_address, attempt_type, success) VALUES ($1, $2, $3, $4)',
        [phoneNumber, ipAddress, attemptType, success]
      );
    } catch (error) {
      this.logger.error('Failed to log OTP attempt:', error);
    }
  }

  /**
   * Send OTP via SMS
   */
  async sendSMS(phoneNumber, message) {
    try {
      // Try Twilio first
      if (this.twilioClient && this.twilioFromNumber) {
        const result = await this.twilioClient.messages.create({
          body: message,
          from: this.twilioFromNumber,
          to: phoneNumber
        });
        
        this.logger.info('SMS sent via Twilio', { 
          to: phoneNumber, 
          sid: result.sid,
          status: result.status 
        });
        
        return {
          success: true,
          provider: 'twilio',
          messageId: result.sid
        };
      }
      
      // Try AWS SNS as fallback
      if (this.snsClient) {
        const params = {
          Message: message,
          PhoneNumber: phoneNumber,
          MessageAttributes: {
            'AWS.SNS.SMS.SMSType': {
              DataType: 'String',
              StringValue: 'Transactional'
            }
          }
        };
        
        const result = await this.snsClient.publish(params).promise();
        
        this.logger.info('SMS sent via AWS SNS', { 
          to: phoneNumber, 
          messageId: result.MessageId 
        });
        
        return {
          success: true,
          provider: 'aws-sns',
          messageId: result.MessageId
        };
      }
      
      // No SMS provider available - log the OTP for development
      this.logger.warn('No SMS provider configured. OTP for development:', { 
        phoneNumber, 
        message 
      });
      
      return {
        success: true,
        provider: 'console',
        messageId: 'dev-' + Date.now()
      };
      
    } catch (error) {
      this.logger.error('SMS sending failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send OTP to user's phone number
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
      
      // Check rate limits
      const rateLimit = await this.checkRateLimit(formattedPhone, ipAddress, 'send');
      if (!rateLimit.allowed) {
        await this.logOTPAttempt(formattedPhone, ipAddress, 'send', false);
        return {
          success: false,
          error: 'Too many OTP requests. Please try again later.',
          rateLimited: true,
          resetTime: rateLimit.resetTime
        };
      }
      
      // Generate OTP
      const otpCode = this.generateOTP();
      const expiresAt = new Date(Date.now() + this.otpExpiryMinutes * 60 * 1000);
      
      // Store OTP in database (either update existing user or create temp record)
      await this.pool.query(`
        INSERT INTO users (phone_number, otp_code, otp_expires_at, failed_otp_attempts, last_otp_request)
        VALUES ($1, $2, $3, 0, NOW())
        ON CONFLICT (phone_number) 
        DO UPDATE SET 
          otp_code = $2,
          otp_expires_at = $3,
          failed_otp_attempts = 0,
          last_otp_request = NOW()
      `, [formattedPhone, otpCode, expiresAt]);
      
      // Prepare SMS message
      const message = `Your ${purpose} code is: ${otpCode}. Valid for ${this.otpExpiryMinutes} minutes. Do not share this code.`;
      
      // Send SMS
      const smsResult = await this.sendSMS(formattedPhone, message);
      
      // Log attempt
      await this.logOTPAttempt(formattedPhone, ipAddress, 'send', smsResult.success);
      
      if (smsResult.success) {
        this.logger.info('OTP sent successfully', { 
          phoneNumber: formattedPhone, 
          provider: smsResult.provider,
          expiresAt: expiresAt.toISOString()
        });
        
        return {
          success: true,
          message: 'OTP sent successfully',
          expiresAt: expiresAt.toISOString(),
          remainingAttempts: rateLimit.remainingAttempts - 1
        };
      } else {
        return {
          success: false,
          error: 'Failed to send OTP. Please try again.',
          details: smsResult.error
        };
      }
      
    } catch (error) {
      this.logger.error('Send OTP error:', error);
      return {
        success: false,
        error: 'Internal server error while sending OTP'
      };
    }
  }

  /**
   * Verify OTP code
   */
  async verifyOTP(phoneNumber, otpCode, ipAddress) {
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
      
      // Check rate limits for verification
      const rateLimit = await this.checkRateLimit(formattedPhone, ipAddress, 'verify');
      if (!rateLimit.allowed) {
        await this.logOTPAttempt(formattedPhone, ipAddress, 'verify', false);
        return {
          success: false,
          error: 'Too many verification attempts. Please request a new OTP.',
          rateLimited: true
        };
      }
      
      // Get user and OTP from database
      const result = await this.pool.query(`
        SELECT id, email, first_name, last_name, otp_code, otp_expires_at, 
               failed_otp_attempts, is_phone_verified, created_at
        FROM users 
        WHERE phone_number = $1
      `, [formattedPhone]);
      
      if (result.rows.length === 0) {
        await this.logOTPAttempt(formattedPhone, ipAddress, 'verify', false);
        return {
          success: false,
          error: 'No OTP request found for this phone number'
        };
      }
      
      const user = result.rows[0];
      
      // Check if OTP exists and is not expired
      if (!user.otp_code || !user.otp_expires_at) {
        await this.logOTPAttempt(formattedPhone, ipAddress, 'verify', false);
        return {
          success: false,
          error: 'No active OTP found. Please request a new one.'
        };
      }
      
      if (new Date() > new Date(user.otp_expires_at)) {
        // Clear expired OTP
        await this.pool.query(`
          UPDATE users 
          SET otp_code = NULL, otp_expires_at = NULL 
          WHERE phone_number = $1
        `, [formattedPhone]);
        
        await this.logOTPAttempt(formattedPhone, ipAddress, 'verify', false);
        return {
          success: false,
          error: 'OTP has expired. Please request a new one.'
        };
      }
      
      // Check if too many failed attempts
      if (user.failed_otp_attempts >= this.maxVerifyAttemptsPerOtp) {
        await this.logOTPAttempt(formattedPhone, ipAddress, 'verify', false);
        return {
          success: false,
          error: 'Too many failed attempts. Please request a new OTP.'
        };
      }
      
      // Verify OTP code
      if (user.otp_code !== otpCode.trim()) {
        // Increment failed attempts
        await this.pool.query(`
          UPDATE users 
          SET failed_otp_attempts = failed_otp_attempts + 1 
          WHERE phone_number = $1
        `, [formattedPhone]);
        
        await this.logOTPAttempt(formattedPhone, ipAddress, 'verify', false);
        
        const remainingAttempts = this.maxVerifyAttemptsPerOtp - (user.failed_otp_attempts + 1);
        return {
          success: false,
          error: 'Invalid OTP code',
          remainingAttempts: Math.max(0, remainingAttempts)
        };
      }
      
      // OTP is valid - clear it and mark phone as verified
      await this.pool.query(`
        UPDATE users 
        SET otp_code = NULL, 
            otp_expires_at = NULL, 
            failed_otp_attempts = 0,
            is_phone_verified = TRUE,
            updated_at = NOW()
        WHERE phone_number = $1
      `, [formattedPhone]);
      
      // Log successful verification
      await this.logOTPAttempt(formattedPhone, ipAddress, 'verify', true);
      
      this.logger.info('OTP verified successfully', { 
        phoneNumber: formattedPhone,
        userId: user.id 
      });
      
      return {
        success: true,
        message: 'OTP verified successfully',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          phoneNumber: formattedPhone,
          isPhoneVerified: true,
          createdAt: user.created_at
        }
      };
      
    } catch (error) {
      this.logger.error('Verify OTP error:', error);
      return {
        success: false,
        error: 'Internal server error while verifying OTP'
      };
    }
  }

  /**
   * Cleanup expired OTP codes and old attempts
   */
  async cleanup() {
    try {
      const result = await this.pool.query('SELECT cleanup_old_otp_attempts()');
      const deletedCount = result.rows[0].cleanup_old_otp_attempts;
      
      this.logger.info(`Cleaned up ${deletedCount} old OTP attempts`);
      return deletedCount;
    } catch (error) {
      this.logger.error('OTP cleanup error:', error);
      return 0;
    }
  }
}

module.exports = OTPService;