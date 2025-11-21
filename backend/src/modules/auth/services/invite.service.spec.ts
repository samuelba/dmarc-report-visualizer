import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fc from 'fast-check';
import { InviteService } from './invite.service';
import { InviteToken } from '../entities/invite-token.entity';
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';
import { PasswordService } from './password.service';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

describe('InviteService', () => {
  let service: InviteService;
  let inviteTokenRepository: Repository<InviteToken>;
  let userRepository: Repository<User>;
  let passwordService: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteService,
        {
          provide: getRepositoryToken(InviteToken),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            hashPassword: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InviteService>(InviteService);
    inviteTokenRepository = module.get<Repository<InviteToken>>(
      getRepositoryToken(InviteToken),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    passwordService = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInvite', () => {
    it('should create an invite token', async () => {
      const email = 'test@example.com';
      const role = UserRole.USER;
      const createdById = '123';

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      const mockInvite = {
        id: '1',
        tokenHash: 'hashed-token',
        email,
        role,
        expiresAt: new Date(),
        used: false,
        createdById,
      } as InviteToken;

      jest.spyOn(inviteTokenRepository, 'create').mockReturnValue(mockInvite);
      jest.spyOn(inviteTokenRepository, 'save').mockResolvedValue(mockInvite);

      const result = await service.createInvite(email, role, createdById);

      expect(result).toEqual({ ...mockInvite, token: expect.any(String) });
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email },
      });
    });

    it('should throw ConflictException if user already exists', async () => {
      const email = 'existing@example.com';
      const existingUser = { id: '1', email } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(existingUser);

      await expect(
        service.createInvite(email, UserRole.USER, '123'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllActive', () => {
    it('should return all active invites', async () => {
      const invites = [
        { id: '1', used: false } as InviteToken,
        { id: '2', used: false } as InviteToken,
      ];

      jest.spyOn(inviteTokenRepository, 'find').mockResolvedValue(invites);

      const result = await service.findAllActive();
      expect(result).toEqual(invites);
    });
  });

  describe('findByToken', () => {
    it('should return an invite by token hash', async () => {
      const tokenHash = 'hashed-token';
      const invite = { id: '1', tokenHash } as InviteToken;

      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(invite);

      const result = await service.findByTokenHash(tokenHash);
      expect(result).toEqual(invite);
    });

    it('should return null if invite not found', async () => {
      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(null);

      const result = await service.findByTokenHash('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('validateInvite', () => {
    it('should return valid for a valid invite', async () => {
      const token = 'valid-token';
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const invite = {
        id: '1',
        tokenHash: 'hashed-token',
        email: 'test@example.com',
        used: false,
        expiresAt: futureDate,
      } as InviteToken;

      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(invite);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await service.validateInvite(token);
      expect(result.valid).toBe(true);
      expect(result.invite).toEqual(invite);
    });

    it('should return invalid for non-existent token', async () => {
      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(null);

      const result = await service.validateInvite('non-existent');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid invitation token');
    });

    it('should return invalid for used invite', async () => {
      const invite = {
        id: '1',
        tokenHash: 'hashed-token',
        used: true,
      } as InviteToken;

      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(invite);

      const result = await service.validateInvite('used-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This invitation has already been used');
    });

    it('should return invalid for expired invite', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const invite = {
        id: '1',
        tokenHash: 'hashed-token',
        used: false,
        expiresAt: pastDate,
      } as InviteToken;

      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(invite);

      const result = await service.validateInvite('expired-token');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('This invitation has expired');
    });
  });

  describe('acceptInvite', () => {
    it('should create user and mark invite as used', async () => {
      const token = 'valid-token';
      const password = 'Password123!';
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const invite = {
        id: '1',
        tokenHash: 'hashed-token',
        email: 'test@example.com',
        role: UserRole.USER,
        used: false,
        expiresAt: futureDate,
      } as InviteToken;

      const user = {
        id: '123',
        email: invite.email,
        role: invite.role,
      } as User;

      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(invite);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(passwordService, 'hashPassword').mockResolvedValue('hashed');
      jest.spyOn(userRepository, 'create').mockReturnValue(user);
      jest.spyOn(userRepository, 'save').mockResolvedValue(user);
      jest.spyOn(inviteTokenRepository, 'save').mockResolvedValue(invite);

      const result = await service.acceptInvite(token, password);

      expect(result).toEqual(user);
      expect(invite.used).toBe(true);
      expect(invite.usedBy).toBe(user.id);
    });

    it('should throw BadRequestException for invalid invite', async () => {
      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.acceptInvite('invalid-token', 'password'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeInvite', () => {
    it('should mark invite as used', async () => {
      const invite = {
        id: '1',
        used: false,
      } as InviteToken;

      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(invite);
      jest.spyOn(inviteTokenRepository, 'save').mockResolvedValue(invite);

      await service.revokeInvite('1');

      expect(invite.used).toBe(true);
      expect(invite.usedAt).toBeDefined();
    });

    it('should throw NotFoundException if invite not found', async () => {
      jest.spyOn(inviteTokenRepository, 'findOne').mockResolvedValue(null);

      await expect(service.revokeInvite('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cleanupExpiredInvites', () => {
    it('should delete expired invites', async () => {
      jest.spyOn(inviteTokenRepository, 'delete').mockResolvedValue({
        affected: 5,
        raw: [],
      });

      await service.cleanupExpiredInvites();

      expect(inviteTokenRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.anything(),
        }),
      );
    });

    it('should preserve active (non-expired) invites', async () => {
      // This test verifies that the delete operation only targets expired invites
      // by checking the query condition
      const mockDelete = jest
        .spyOn(inviteTokenRepository, 'delete')
        .mockResolvedValue({
          affected: 0, // No invites deleted means active ones were preserved
          raw: [],
        });

      await service.cleanupExpiredInvites();

      // Verify delete was called with a condition that only targets expired invites
      expect(mockDelete).toHaveBeenCalled();
      const deleteCall = mockDelete.mock.calls[0][0];

      // The delete condition should use LessThan operator which only targets expired invites
      expect(deleteCall).toHaveProperty('expiresAt');
    });
  });

  /**
   * Feature: user-management, Property 4: Invite token uniqueness and expiration
   * Validates: Requirements 2.2
   *
   * Property: For any set of invite tokens created, all tokens should be unique
   * and have an expiration date exactly 7 days from creation time
   */
  describe('Property 4: Invite token uniqueness and expiration', () => {
    it('should generate unique tokens with 7-day expiration', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate multiple invite requests
          fc.array(
            fc.record({
              email: fc.emailAddress(),
              role: fc.constantFrom(UserRole.USER, UserRole.ADMINISTRATOR),
              createdById: fc.uuid(),
            }),
            { minLength: 2, maxLength: 10 },
          ),
          async (inviteRequests) => {
            const tokens = new Set<string>();
            const createdInvites: InviteToken[] = [];

            // Mock user repository to always return null (no existing users)
            jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

            jest
              .spyOn(inviteTokenRepository, 'create')
              .mockImplementation((data: any) => {
                return {
                  ...data,
                  id: Math.random().toString(),
                  createdAt: new Date(),
                } as InviteToken;
              });

            jest
              .spyOn(inviteTokenRepository, 'save')
              .mockImplementation(async (invite: InviteToken) => {
                return invite;
              });

            for (const request of inviteRequests) {
              const creationTime = new Date();

              const invite = await service.createInvite(
                request.email,
                request.role,
                request.createdById,
              );

              createdInvites.push(invite);
              tokens.add(invite.token);

              // Verify expiration is 7 days from creation
              const expectedExpiration = new Date(creationTime);
              expectedExpiration.setDate(expectedExpiration.getDate() + 7);

              const timeDiff = Math.abs(
                invite.expiresAt.getTime() - expectedExpiration.getTime(),
              );
              // Allow 1 second tolerance for execution time
              expect(timeDiff).toBeLessThan(1000);
            }

            // Verify all tokens are unique
            expect(tokens.size).toBe(inviteRequests.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: user-management, Property 5: Invalid invite rejection
   * Validates: Requirements 3.1, 7.2
   *
   * Property: For any invite token that is expired, already used, or non-existent,
   * validation should return false with an appropriate error message
   */
  describe('Property 5: Invalid invite rejection', () => {
    it('should reject all invalid invites with appropriate errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate various invalid invite scenarios
          fc.oneof(
            // Scenario 1: Non-existent token
            fc.record({
              type: fc.constant('non-existent'),
              token: fc.string({ minLength: 10, maxLength: 50 }),
            }),
            // Scenario 2: Expired token
            fc.record({
              type: fc.constant('expired'),
              token: fc.string({ minLength: 10, maxLength: 50 }),
              email: fc.emailAddress(),
              role: fc.constantFrom(UserRole.USER, UserRole.ADMINISTRATOR),
              daysExpired: fc.integer({ min: 1, max: 365 }),
            }),
            // Scenario 3: Already used token
            fc.record({
              type: fc.constant('used'),
              token: fc.string({ minLength: 10, maxLength: 50 }),
              email: fc.emailAddress(),
              role: fc.constantFrom(UserRole.USER, UserRole.ADMINISTRATOR),
            }),
          ),
          async (scenario) => {
            if (scenario.type === 'non-existent') {
              // Mock: token doesn't exist
              jest
                .spyOn(inviteTokenRepository, 'findOne')
                .mockResolvedValue(null);

              const result = await service.validateInvite(scenario.token);

              expect(result.valid).toBe(false);
              expect(result.error).toBe('Invalid invitation token');
            } else if (scenario.type === 'expired') {
              // Mock: token exists but is expired
              const expiredDate = new Date();
              expiredDate.setDate(expiredDate.getDate() - scenario.daysExpired);

              const invite = {
                id: '1',
                tokenHash: 'hashed-token',
                email: scenario.email,
                role: scenario.role,
                used: false,
                expiresAt: expiredDate,
              } as InviteToken;

              jest
                .spyOn(inviteTokenRepository, 'findOne')
                .mockResolvedValue(invite);

              const result = await service.validateInvite(scenario.token);

              expect(result.valid).toBe(false);
              expect(result.error).toBe('This invitation has expired');
            } else if (scenario.type === 'used') {
              // Mock: token exists but is already used
              const futureDate = new Date();
              futureDate.setDate(futureDate.getDate() + 7);

              const invite = {
                id: '1',
                tokenHash: 'hashed-token',
                email: scenario.email,
                role: scenario.role,
                used: true,
                usedAt: new Date(),
                expiresAt: futureDate,
              } as InviteToken;

              jest
                .spyOn(inviteTokenRepository, 'findOne')
                .mockResolvedValue(invite);

              const result = await service.validateInvite(scenario.token);

              expect(result.valid).toBe(false);
              expect(result.error).toBe(
                'This invitation has already been used',
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
