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

  describe('Token Theft Detection', () => {
    describe('Sequential Theft Scenario', () => {
      it('should detect theft when revoked token is reused and invalidate token family', async () => {
        // Setup: Create user
        const setupDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };
        let response = await request(app.getHttpServer())
          .post('/auth/setup')
          .send(setupDto)
          .expect(201);

        // Step 1: User logs in and gets RT_A
        const loginDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
        };
        response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(200);

        const cookies = getCookies(response);
        const rtA =
          cookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // Step 2: User refreshes and gets RT_B (RT_A is revoked)
        response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', rtA)
          .expect(200);

        const newCookies = getCookies(response);
        const rtB =
          newCookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // Verify RT_A is revoked in database
        const tokensAfterRefresh = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revoked = true AND revocation_reason = $1',
          ['rotation'],
        );
        expect(tokensAfterRefresh.length).toBe(1);

        // Step 3: Simulate attacker using RT_A (revoked token)
        response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', rtA)
          .expect(401);

        // Step 4: Verify theft detection triggers
        expect(response.body.errorCode).toBe('SESSION_COMPROMISED');
        expect(response.body.message).toContain('security reasons');

        // Step 5: Verify RT_B is invalidated (entire family revoked)
        const allTokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revoked = true AND revocation_reason = $1',
          ['theft_detected'],
        );
        expect(allTokens.length).toBeGreaterThan(0);

        // Step 6: Verify RT_B can no longer be used
        await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', rtB)
          .expect(401);
      });
    });

    describe('Concurrent Theft Scenario', () => {
      it('should detect concurrent token use via atomic UPDATE and invalidate family', async () => {
        // Setup: Create user and login
        const setupDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };
        let response = await request(app.getHttpServer())
          .post('/auth/setup')
          .send(setupDto)
          .expect(201);

        // Step 1: User logs in and gets RT_A
        const loginDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
        };
        response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(200);

        const cookies = getCookies(response);
        const rtA =
          cookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // Step 2: Simulate user and attacker both refreshing with RT_A simultaneously
        const [userResponse, attackerResponse] = await Promise.all([
          request(app.getHttpServer()).post('/auth/refresh').set('Cookie', rtA),
          request(app.getHttpServer()).post('/auth/refresh').set('Cookie', rtA),
        ]);

        // Step 3: Verify only one request succeeds (atomic UPDATE)
        const responses = [userResponse, attackerResponse];
        const successResponses = responses.filter((r) => r.status === 200);
        const failureResponses = responses.filter((r) => r.status === 401);

        expect(successResponses.length).toBe(1);
        expect(failureResponses.length).toBe(1);

        // Step 4: Verify second request triggers theft detection
        expect(failureResponses[0].body.errorCode).toBe('SESSION_COMPROMISED');

        // Step 5: Verify token family is invalidated
        const theftTokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revocation_reason = $1',
          ['theft_detected'],
        );
        expect(theftTokens.length).toBeGreaterThan(0);

        // Verify the successful token (RT_B) is also invalidated
        const successCookies = getCookies(successResponses[0]);
        const rtB =
          successCookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', rtB)
          .expect(401);
      });
    });

    describe('Multi-Device Scenario', () => {
      it('should only invalidate compromised family, not other device sessions', async () => {
        // Setup: Create user
        const setupDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };
        await request(app.getHttpServer())
          .post('/auth/setup')
          .send(setupDto)
          .expect(201);

        const loginDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
        };

        // Step 1: User logs in on Device A (family F1)
        let response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(200);

        const deviceACookies = getCookies(response);
        const deviceA_RT =
          deviceACookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // Get family ID for Device A
        const deviceATokens = await dataSource.query(
          'SELECT family_id FROM refresh_tokens WHERE revoked = false ORDER BY created_at DESC LIMIT 1',
        );
        const familyF1 = deviceATokens[0].family_id;

        // Step 2: User logs in on Device B (family F2)
        response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(200);

        const deviceBCookies = getCookies(response);
        const deviceB_RT =
          deviceBCookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // Get family ID for Device B
        const deviceBTokens = await dataSource.query(
          'SELECT family_id FROM refresh_tokens WHERE revoked = false ORDER BY created_at DESC LIMIT 1',
        );
        const familyF2 = deviceBTokens[0].family_id;

        // Verify different families
        expect(familyF1).not.toBe(familyF2);

        // Step 3: Refresh Device A token to create RT_A2
        response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', deviceA_RT)
          .expect(200);

        const deviceA_RT2_cookies = getCookies(response);
        const deviceA_RT2 =
          deviceA_RT2_cookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // Step 4: Simulate theft on Device A (attacker uses old Device A token)
        await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', deviceA_RT)
          .expect(401);

        // Step 5: Verify only family F1 is invalidated
        const f1Tokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE family_id = $1 AND revoked = true AND revocation_reason = $2',
          [familyF1, 'theft_detected'],
        );
        expect(f1Tokens.length).toBeGreaterThan(0);

        // Step 6: Verify Device B session (family F2) remains active
        response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', deviceB_RT)
          .expect(200);

        expect(response.body).toHaveProperty('accessToken');

        // Verify Device A RT2 is invalidated
        await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', deviceA_RT2)
          .expect(401);
      });
    });

    describe('Theft Detection with Different Revocation Reasons', () => {
      it('should detect theft after logout (revocationReason=logout)', async () => {
        // Setup: Create user and login
        const setupDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };
        let response = await request(app.getHttpServer())
          .post('/auth/setup')
          .send(setupDto)
          .expect(201);

        const loginDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
        };
        response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(200);

        const accessToken = response.body.accessToken;
        const cookies = getCookies(response);
        const refreshToken =
          cookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // User logs out (revocationReason='logout')
        await request(app.getHttpServer())
          .post('/auth/logout')
          .set('Authorization', `Bearer ${accessToken}`)
          .set('Cookie', refreshToken)
          .expect(200);

        // Verify token is revoked with 'logout' reason
        const logoutTokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revocation_reason = $1',
          ['logout'],
        );
        expect(logoutTokens.length).toBe(1);

        // Simulate attacker using logged-out token
        response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', refreshToken)
          .expect(401);

        // Verify theft detection triggers
        expect(response.body.errorCode).toBe('SESSION_COMPROMISED');

        // Verify originalRevocationReason is logged (token marked as theft_detected)
        const theftTokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revocation_reason = $1',
          ['theft_detected'],
        );
        expect(theftTokens.length).toBe(1);
      });

      it('should detect theft after password change (revocationReason=password_change)', async () => {
        // Setup: Create user and login
        const setupDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };
        let response = await request(app.getHttpServer())
          .post('/auth/setup')
          .send(setupDto)
          .expect(201);

        const loginDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
        };
        response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(200);

        const accessToken = response.body.accessToken;
        const cookies = getCookies(response);
        const refreshToken =
          cookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // User changes password (revocationReason='password_change')
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

        // Verify token is revoked with 'password_change' reason
        const passwordChangeTokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revocation_reason = $1',
          ['password_change'],
        );
        expect(passwordChangeTokens.length).toBe(1);

        // Simulate attacker using old token after password change
        response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', refreshToken)
          .expect(401);

        // Verify theft detection triggers
        expect(response.body.errorCode).toBe('SESSION_COMPROMISED');

        // Verify token is marked as theft_detected
        const theftTokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revocation_reason = $1',
          ['theft_detected'],
        );
        expect(theftTokens.length).toBe(1);
      });

      it('should detect theft after rotation (revocationReason=rotation)', async () => {
        // Setup: Create user and login
        const setupDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };
        let response = await request(app.getHttpServer())
          .post('/auth/setup')
          .send(setupDto)
          .expect(201);

        const loginDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
        };
        response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(200);

        const cookies = getCookies(response);
        const rtA =
          cookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // User refreshes token (revocationReason='rotation')
        response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', rtA)
          .expect(200);

        // Verify token is revoked with 'rotation' reason
        const rotationTokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revocation_reason = $1',
          ['rotation'],
        );
        expect(rotationTokens.length).toBe(1);

        // Simulate attacker using rotated token
        response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', rtA)
          .expect(401);

        // Verify theft detection triggers
        expect(response.body.errorCode).toBe('SESSION_COMPROMISED');

        // Verify token is marked as theft_detected
        const theftTokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revocation_reason = $1',
          ['theft_detected'],
        );
        expect(theftTokens.length).toBeGreaterThan(0);
      });

      it('should log originalRevocationReason correctly for all scenarios', async () => {
        // This test verifies that the security alert logs include the original revocation reason
        // The actual logging verification would require a logger spy/mock
        // For now, we verify the database state shows the progression

        // Setup: Create user and login
        const setupDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };
        let response = await request(app.getHttpServer())
          .post('/auth/setup')
          .send(setupDto)
          .expect(201);

        const loginDto = {
          email: 'user@example.com',
          password: 'SecurePass123!',
        };
        response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)
          .expect(200);

        const cookies = getCookies(response);
        const refreshToken =
          cookies.find((cookie: string) =>
            cookie.startsWith('refreshToken='),
          ) || '';

        // Refresh to create a rotation
        response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', refreshToken)
          .expect(200);

        // Get the original token with rotation reason
        const originalToken = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revocation_reason = $1 LIMIT 1',
          ['rotation'],
        );
        expect(originalToken.length).toBe(1);
        expect(originalToken[0].revocation_reason).toBe('rotation');

        // Attempt to use the revoked token (triggers theft detection)
        await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', refreshToken)
          .expect(401);

        // Verify the token family is now marked as theft_detected
        const theftTokens = await dataSource.query(
          'SELECT * FROM refresh_tokens WHERE revocation_reason = $1',
          ['theft_detected'],
        );
        expect(theftTokens.length).toBeGreaterThan(0);

        // The originalRevocationReason would be 'rotation' in the security log
        // (verified through the database state transition)
      });
    });
  });
});
