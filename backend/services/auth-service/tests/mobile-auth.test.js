const request = require('supertest');
const app = require('../src/app');
const { Pool } = require('pg');

// Mock the database pool for testing
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

describe('Mobile Authentication Endpoints', () => {
  let pool;

  beforeEach(() => {
    pool = new Pool();
    jest.clearAllMocks();
  });

  describe('POST /auth/send-otp', () => {
    it('should send OTP successfully with valid phone number', async () => {
      // Mock database queries
      pool.query
        .mockResolvedValueOnce({ rows: [{ attempt_count: 0 }] }) // Rate limit check
        .mockResolvedValueOnce({ rows: [] }); // Insert OTP

      const response = await request(app)
        .post('/auth/send-otp')
        .send({
          phoneNumber: '+1234567890',
          countryCode: 'US'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('OTP sent successfully');
    });

    it('should reject invalid phone number format', async () => {
      const response = await request(app)
        .post('/auth/send-otp')
        .send({
          phoneNumber: '123', // Invalid phone number
          countryCode: 'US'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });

    it('should enforce rate limiting', async () => {
      // Mock rate limit exceeded
      pool.query.mockResolvedValueOnce({ rows: [{ attempt_count: 10 }] });

      const response = await request(app)
        .post('/auth/send-otp')
        .send({
          phoneNumber: '+1234567890',
          countryCode: 'US'
        });

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Too many OTP requests');
    });
  });

  describe('POST /auth/verify-otp', () => {
    it('should verify OTP and login successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        otp_code: '123456',
        otp_expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
        failed_otp_attempts: 0,
        is_phone_verified: false,
        created_at: new Date()
      };

      pool.query
        .mockResolvedValueOnce({ rows: [{ attempt_count: 0 }] }) // Rate limit check
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [] }); // Update user

      const response = await request(app)
        .post('/auth/verify-otp')
        .send({
          phoneNumber: '+1234567890',
          otpCode: '123456'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(1);
    });

    it('should reject invalid OTP code', async () => {
      const mockUser = {
        id: 1,
        otp_code: '123456',
        otp_expires_at: new Date(Date.now() + 10 * 60 * 1000),
        failed_otp_attempts: 0
      };

      pool.query
        .mockResolvedValueOnce({ rows: [{ attempt_count: 0 }] }) // Rate limit check
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [] }); // Update failed attempts

      const response = await request(app)
        .post('/auth/verify-otp')
        .send({
          phoneNumber: '+1234567890',
          otpCode: '654321' // Wrong OTP
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid OTP code');
    });

    it('should reject expired OTP', async () => {
      const mockUser = {
        id: 1,
        otp_code: '123456',
        otp_expires_at: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago (expired)
        failed_otp_attempts: 0
      };

      pool.query
        .mockResolvedValueOnce({ rows: [{ attempt_count: 0 }] }) // Rate limit check
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [] }); // Clear expired OTP

      const response = await request(app)
        .post('/auth/verify-otp')
        .send({
          phoneNumber: '+1234567890',
          otpCode: '123456'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('OTP has expired');
    });
  });

  describe('POST /auth/register-mobile', () => {
    it('should register new user with mobile number', async () => {
      const mockUser = {
        id: 1,
        email: null, // New user, no email set yet
        first_name: null,
        last_name: null,
        otp_code: '123456',
        otp_expires_at: new Date(Date.now() + 10 * 60 * 1000),
        failed_otp_attempts: 0,
        phone_number: '+1234567890',
        is_phone_verified: false,
        created_at: new Date()
      };

      const updatedUser = {
        ...mockUser,
        email: 'john@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_phone_verified: true
      };

      pool.query
        .mockResolvedValueOnce({ rows: [{ attempt_count: 0 }] }) // Rate limit check
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user for OTP verification
        .mockResolvedValueOnce({ rows: [] }) // Update user (clear OTP)
        .mockResolvedValueOnce({ rows: [] }) // Check email availability
        .mockResolvedValueOnce({ rows: [updatedUser] }); // Update user with details

      const response = await request(app)
        .post('/auth/register-mobile')
        .send({
          phoneNumber: '+1234567890',
          otpCode: '123456',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.firstName).toBe('John');
      expect(response.body.user.lastName).toBe('Doe');
    });

    it('should reject registration with invalid OTP', async () => {
      const mockUser = {
        id: 1,
        otp_code: '123456',
        otp_expires_at: new Date(Date.now() + 10 * 60 * 1000),
        failed_otp_attempts: 0
      };

      pool.query
        .mockResolvedValueOnce({ rows: [{ attempt_count: 0 }] }) // Rate limit check
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get user
        .mockResolvedValueOnce({ rows: [] }); // Update failed attempts

      const response = await request(app)
        .post('/auth/register-mobile')
        .send({
          phoneNumber: '+1234567890',
          otpCode: '654321', // Wrong OTP
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid OTP code');
    });
  });

  describe('POST /auth/check-phone', () => {
    it('should check if phone number exists and is registered', async () => {
      const mockUser = {
        id: 1,
        email: 'john@example.com',
        first_name: 'John',
        last_name: 'Doe',
        is_phone_verified: true
      };

      pool.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/auth/check-phone')
        .send({
          phoneNumber: '+1234567890'
        });

      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(true);
      expect(response.body.isRegistered).toBe(true);
      expect(response.body.isPhoneVerified).toBe(true);
      expect(response.body.phoneNumber).toBe('+1234567890');
    });

    it('should return false for non-existent phone number', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/check-phone')
        .send({
          phoneNumber: '+1234567890'
        });

      expect(response.status).toBe(200);
      expect(response.body.exists).toBe(false);
      expect(response.body.isRegistered).toBe(false);
      expect(response.body.isPhoneVerified).toBe(false);
    });
  });

  describe('Input Validation', () => {
    it('should validate phone number format', async () => {
      const invalidPhoneNumbers = [
        '123',
        'abc',
        '+1',
        '123456789012345678901' // Too long
      ];

      for (const phoneNumber of invalidPhoneNumbers) {
        const response = await request(app)
          .post('/auth/send-otp')
          .send({ phoneNumber });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Validation failed');
      }
    });

    it('should validate OTP code format', async () => {
      const invalidOTPs = [
        '123',      // Too short
        '1234567',  // Too long
        'abcdef',   // Not numeric
        '12345a'    // Mixed characters
      ];

      for (const otpCode of invalidOTPs) {
        const response = await request(app)
          .post('/auth/verify-otp')
          .send({
            phoneNumber: '+1234567890',
            otpCode
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Validation failed');
      }
    });

    it('should validate name fields in registration', async () => {
      const response = await request(app)
        .post('/auth/register-mobile')
        .send({
          phoneNumber: '+1234567890',
          otpCode: '123456',
          firstName: 'J', // Too short
          lastName: 'Doe123' // Contains numbers
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });
  });
});

// Integration tests with real database (comment out for unit tests)
/*
describe('Mobile Authentication Integration Tests', () => {
  let pool;

  beforeAll(async () => {
    // Setup test database connection
    pool = new Pool({
      host: process.env.TEST_DB_HOST || 'localhost',
      database: process.env.TEST_DB_NAME || 'taskmanager_test',
      user: process.env.TEST_DB_USER || 'taskuser',
      password: process.env.TEST_DB_PASSWORD || 'taskpassword',
      port: 5432,
    });

    // Run migrations
    await pool.query(`
      -- Add test-specific setup here
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM otp_attempts');
    await pool.query('DELETE FROM users WHERE email LIKE %test%');
  });

  it('should complete full registration flow', async () => {
    const phoneNumber = '+15551234567';
    
    // Step 1: Send OTP
    const sendResponse = await request(app)
      .post('/auth/send-otp')
      .send({ phoneNumber });
    
    expect(sendResponse.status).toBe(200);
    
    // Step 2: Get OTP from database (in real test, this would be from SMS)
    const otpResult = await pool.query(
      'SELECT otp_code FROM users WHERE phone_number = $1',
      [phoneNumber]
    );
    
    const otpCode = otpResult.rows[0].otp_code;
    
    // Step 3: Register with OTP
    const registerResponse = await request(app)
      .post('/auth/register-mobile')
      .send({
        phoneNumber,
        otpCode,
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      });
    
    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.token).toBeDefined();
    
    // Step 4: Verify user was created
    const userResult = await pool.query(
      'SELECT * FROM users WHERE phone_number = $1',
      [phoneNumber]
    );
    
    expect(userResult.rows.length).toBe(1);
    expect(userResult.rows[0].is_phone_verified).toBe(true);
    expect(userResult.rows[0].first_name).toBe('Test');
  });
});
*/