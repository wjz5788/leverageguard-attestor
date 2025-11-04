import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('Authentication API', () => {
  describe('POST /api/v1/auth/login', () => {
    it('should login with email successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          type: 'email',
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('session');
      expect(response.body).toHaveProperty('profile');
      expect(response.body.session.loginType).toBe('email');
    });

    it('should login with wallet successfully', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          type: 'wallet',
          walletAddress: '0x742d35Cc6634C0532925a3b8D8a8b7E7F5e5e5e5',
          signature: '0x1234567890abcdef',
          nonce: 'test-nonce-123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('session');
      expect(response.body).toHaveProperty('profile');
      expect(response.body.session.loginType).toBe('wallet');
    });

    it('should return 400 for invalid login payload', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          type: 'invalid',
          email: 'not-an-email'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'INVALID_REQUEST');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      // First login to get a token
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          type: 'email',
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      // Then logout
      await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });

    it('should return 401 without token', async () => {
      await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });

  describe('GET /api/v1/account/profile', () => {
    it('should get profile with valid token', async () => {
      // First login to get a token
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          type: 'email',
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      // Then get profile
      const response = await request(app)
        .get('/api/v1/account/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile.email).toBe('test@example.com');
    });

    it('should return 401 without token', async () => {
      await request(app)
        .get('/api/v1/account/profile')
        .expect(401);
    });
  });

  describe('PATCH /api/v1/account/profile', () => {
    it('should update profile with valid token', async () => {
      // First login to get a token
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          type: 'email',
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      // Then update profile
      const response = await request(app)
        .patch('/api/v1/account/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Test User',
          language: 'zh-CN'
        })
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body.profile.displayName).toBe('Test User');
      expect(response.body.profile.language).toBe('zh-CN');
    });

    it('should return 400 for invalid update data', async () => {
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          type: 'email',
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      await request(app)
        .patch('/api/v1/account/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: '' // Invalid: empty string
        })
        .expect(400);
    });
  });
});