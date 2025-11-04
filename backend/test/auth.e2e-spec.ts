import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

// Helper function to extract cookies
function getCookies(response: request.Response): string[] {
  const cookies = response.headers['set-cookie'];
  if (Array.isArray(cookies)) {
    return cookies;
  }
  if (typeof cookies === 'string') {
    return [cookies];
  }
  return [];
}

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let accessToken: string;
  let refreshTokenCookie: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await dataSource.query('DELETE FROM refresh_tokens');
    await dataSource.query('DELETE FROM users');
  });

  describe('Setup Flow', () => {
    it('should check that setup is needed when no users exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/check-setup')
        .expect(200);

      expect(response.body).toEqual({ needsSetup: true });
    });

    it('should create initial user account through setup', async () => {
      const setupDto = {
        email: 'admin@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/setup')
        .send(setupDto)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('admin@example.com');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('Login Flow', () => {
    beforeEach(async () => {
      const setupDto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };
      await request(app.getHttpServer()).post('/auth/setup').send(setupDto);
    });

    it('should login with valid credentials', async () => {
      const loginDto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('user@example.com');

      const cookies = getCookies(response);
      expect(cookies.length).toBeGreaterThan(0);
      expect(
        cookies.some((cookie: string) => cookie.startsWith('refreshToken=')),
      ).toBe(true);
    });
  });

  describe('Protected Endpoints', () => {
    beforeEach(async () => {
      const setupDto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };
      const setupResponse = await request(app.getHttpServer())
        .post('/auth/setup')
        .send(setupDto);
      accessToken = setupResponse.body.accessToken;
    });

    it('should access protected endpoint with valid token', async () => {
      await request(app.getHttpServer())
        .get('/dmarc-reports')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should reject access without token', async () => {
      await request(app.getHttpServer()).get('/dmarc-reports').expect(401);
    });
  });

  describe('Token Refresh Flow', () => {
    beforeEach(async () => {
      const setupDto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/setup')
        .send(setupDto);
      accessToken = loginResponse.body.accessToken;
      const cookies = getCookies(loginResponse);
      refreshTokenCookie =
        cookies.find((cookie: string) => cookie.startsWith('refreshToken=')) ||
        '';
    });

    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.accessToken).not.toBe(accessToken);

      const cookies = getCookies(response);
      expect(cookies.length).toBeGreaterThan(0);
      expect(
        cookies.some((cookie: string) => cookie.startsWith('refreshToken=')),
      ).toBe(true);
    });
  });

  describe('Logout Flow', () => {
    beforeEach(async () => {
      const setupDto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/setup')
        .send(setupDto);
      accessToken = loginResponse.body.accessToken;
      const cookies = getCookies(loginResponse);
      refreshTokenCookie =
        cookies.find((cookie: string) => cookie.startsWith('refreshToken=')) ||
        '';
    });

    it('should logout and invalidate refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      const cookies = getCookies(response);
      expect(cookies.length).toBeGreaterThan(0);
      const refreshCookie = cookies.find((cookie: string) =>
        cookie.startsWith('refreshToken='),
      );
      expect(refreshCookie).toContain('Max-Age=0');

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(401);
    });
  });

  describe('Password Change Flow', () => {
    beforeEach(async () => {
      const setupDto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/setup')
        .send(setupDto);
      accessToken = loginResponse.body.accessToken;
      const cookies = getCookies(loginResponse);
      refreshTokenCookie =
        cookies.find((cookie: string) => cookie.startsWith('refreshToken=')) ||
        '';
    });

    it('should change password with valid credentials', async () => {
      const changePasswordDto = {
        currentPassword: 'SecurePass123!',
        newPassword: 'NewSecurePass456!',
        newPasswordConfirmation: 'NewSecurePass456!',
      };

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(changePasswordDto)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(401);

      const loginDto = {
        email: 'user@example.com',
        password: 'NewSecurePass456!',
      };

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(async () => {
      const setupDto = {
        email: 'user@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };
      await request(app.getHttpServer()).post('/auth/setup').send(setupDto);
    });

    it('should rate limit after multiple failed login attempts', async () => {
      const loginDto = {
        email: 'user@example.com',
        password: 'WrongPassword123!',
      };

      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(401);
      }

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(429);
      expect(response.body).toHaveProperty('retryAfter');
      expect(response.body.message).toContain('Too many');
    });

    it('should lock account after multiple failed attempts', async () => {
      const loginDto = {
        email: 'user@example.com',
        password: 'WrongPassword123!',
      };

      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(401);
      }

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(423);
      expect(response.body).toHaveProperty('retryAfter');
      expect(response.body.message).toContain('locked');
    });
  });

  describe('Complete Authentication Journey', () => {
    it('should complete full authentication lifecycle', async () => {
      let response = await request(app.getHttpServer())
        .get('/auth/check-setup')
        .expect(200);
      expect(response.body.needsSetup).toBe(true);

      const setupDto = {
        email: 'admin@example.com',
        password: 'InitialPass123!',
        passwordConfirmation: 'InitialPass123!',
      };

      response = await request(app.getHttpServer())
        .post('/auth/setup')
        .send(setupDto)
        .expect(201);
      let accessToken = response.body.accessToken;
      let cookies = getCookies(response);
      let refreshTokenCookie =
        cookies.find((cookie: string) => cookie.startsWith('refreshToken=')) ||
        '';

      await request(app.getHttpServer())
        .get('/dmarc-reports')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      accessToken = response.body.accessToken;
      cookies = getCookies(response);
      refreshTokenCookie =
        cookies.find((cookie: string) => cookie.startsWith('refreshToken=')) ||
        '';

      const changePasswordDto = {
        currentPassword: 'InitialPass123!',
        newPassword: 'UpdatedPass456!',
        newPasswordConfirmation: 'UpdatedPass456!',
      };

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(changePasswordDto)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(401);

      const loginDto = {
        email: 'admin@example.com',
        password: 'UpdatedPass456!',
      };

      response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto)
        .expect(200);
      accessToken = response.body.accessToken;
      cookies = getCookies(response);
      refreshTokenCookie =
        cookies.find((cookie: string) => cookie.startsWith('refreshToken=')) ||
        '';

      await request(app.getHttpServer())
        .get('/dmarc-reports')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      await request(app.getHttpServer())
        .get('/dmarc-reports')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(401);
    });
  });
});
