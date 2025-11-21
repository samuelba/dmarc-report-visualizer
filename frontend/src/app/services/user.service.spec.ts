import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import {
  UserService,
  UserRole,
  UserResponse,
  InviteToken,
  InviteResponse,
  InviteDetailsResponse,
  AuthResponse,
} from './user.service';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;
  const apiBase = '/api/auth';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UserService],
    });
    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getAllUsers', () => {
    it('should call correct endpoint and return users', () => {
      const mockUsers: UserResponse[] = [
        {
          id: 'user-1',
          email: 'admin@example.com',
          role: UserRole.ADMINISTRATOR,
          authProvider: 'local',
          createdAt: new Date('2024-01-01'),
          totpEnabled: false,
        },
        {
          id: 'user-2',
          email: 'user@example.com',
          role: UserRole.USER,
          authProvider: 'saml',
          createdAt: new Date('2024-01-02'),
          totpEnabled: true,
        },
      ];

      service.getAllUsers().subscribe((users) => {
        expect(users).toEqual(mockUsers);
        expect(users.length).toBe(2);
      });

      const req = httpMock.expectOne(`${apiBase}/users`);
      expect(req.request.method).toBe('GET');
      req.flush(mockUsers);
    });
  });

  describe('updateUserRole', () => {
    it('should call correct endpoint with role data', () => {
      const userId = 'user-123';
      const newRole = UserRole.ADMINISTRATOR;
      const mockResponse: UserResponse = {
        id: userId,
        email: 'user@example.com',
        role: newRole,
        authProvider: 'local',
        createdAt: new Date('2024-01-01'),
        totpEnabled: false,
      };

      service.updateUserRole(userId, newRole).subscribe((user) => {
        expect(user).toEqual(mockResponse);
        expect(user.role).toBe(newRole);
      });

      const req = httpMock.expectOne(`${apiBase}/users/${userId}/role`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ role: newRole });
      req.flush(mockResponse);
    });
  });

  describe('deleteUser', () => {
    it('should call correct endpoint', () => {
      const userId = 'user-123';

      service.deleteUser(userId).subscribe(() => {
        // Deletion successful
      });

      const req = httpMock.expectOne(`${apiBase}/users/${userId}`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('createInvite', () => {
    it('should call correct endpoint and return invite', () => {
      const email = 'newuser@example.com';
      const role = UserRole.USER;
      const mockResponse: InviteResponse = {
        id: 'invite-123',
        email,
        role,
        inviteLink: 'https://app.example.com/invite/abc123token',
        expiresAt: new Date('2024-01-08'),
      };

      service.createInvite(email, role).subscribe((invite) => {
        expect(invite).toEqual(mockResponse);
        expect(invite.email).toBe(email);
        expect(invite.role).toBe(role);
      });

      const req = httpMock.expectOne(`${apiBase}/users/invite`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email, role });
      req.flush(mockResponse);
    });
  });

  describe('getActiveInvites', () => {
    it('should call correct endpoint and return invites', () => {
      const mockInvites: InviteToken[] = [
        {
          id: 'invite-1',
          email: 'user1@example.com',
          role: UserRole.USER,
          expiresAt: new Date('2024-01-08'),
          used: false,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'invite-2',
          email: 'admin@example.com',
          role: UserRole.ADMINISTRATOR,
          expiresAt: new Date('2024-01-09'),
          used: false,
          createdAt: new Date('2024-01-02'),
        },
      ];

      service.getActiveInvites().subscribe((invites) => {
        expect(invites).toEqual(mockInvites);
        expect(invites.length).toBe(2);
      });

      const req = httpMock.expectOne(`${apiBase}/invites`);
      expect(req.request.method).toBe('GET');
      req.flush(mockInvites);
    });
  });

  describe('revokeInvite', () => {
    it('should call correct endpoint', () => {
      const inviteId = 'invite-123';

      service.revokeInvite(inviteId).subscribe(() => {
        // Revocation successful
      });

      const req = httpMock.expectOne(`${apiBase}/invites/${inviteId}`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('getInviteDetails', () => {
    it('should call correct endpoint and return valid invite details', () => {
      const token = 'abc123token';
      const mockResponse: InviteDetailsResponse = {
        valid: true,
        email: 'newuser@example.com',
        role: UserRole.USER,
        expiresAt: new Date('2024-01-08'),
      };

      service.getInviteDetails(token).subscribe((details) => {
        expect(details).toEqual(mockResponse);
        expect(details.valid).toBe(true);
      });

      const req = httpMock.expectOne(`${apiBase}/invite/${token}`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should return invalid invite details with error', () => {
      const token = 'invalid-token';
      const mockResponse: InviteDetailsResponse = {
        valid: false,
        error: 'Invitation has expired',
      };

      service.getInviteDetails(token).subscribe((details) => {
        expect(details).toEqual(mockResponse);
        expect(details.valid).toBe(false);
        expect(details.error).toBe('Invitation has expired');
      });

      const req = httpMock.expectOne(`${apiBase}/invite/${token}`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('acceptInvite', () => {
    it('should call correct endpoint and return auth response', () => {
      const token = 'abc123token';
      const password = 'SecurePass123!';
      const passwordConfirmation = 'SecurePass123!';
      const mockResponse: AuthResponse = {
        user: {
          id: 'user-123',
          email: 'newuser@example.com',
          authProvider: 'local',
          role: UserRole.USER,
        },
      };

      service.acceptInvite(token, password, passwordConfirmation).subscribe((response) => {
        expect(response).toEqual(mockResponse);
        expect(response.user.email).toBe('newuser@example.com');
      });

      const req = httpMock.expectOne(`${apiBase}/invite/${token}/accept`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ password, passwordConfirmation });
      req.flush(mockResponse);
    });
  });
});
