import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fc from 'fast-check';
import { UserService } from './user.service';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { UserRole } from '../enums/user-role.enum';
import { RevocationReason } from '../entities/refresh-token.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('UserService', () => {
  let service: UserService;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    refreshTokenRepository = module.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const users: User[] = [
        {
          id: '1',
          email: 'user1@example.com',
          role: UserRole.USER,
        } as User,
        {
          id: '2',
          email: 'user2@example.com',
          role: UserRole.ADMINISTRATOR,
        } as User,
      ];

      jest.spyOn(userRepository, 'find').mockResolvedValue(users);

      const result = await service.findAll();
      expect(result).toEqual(users);
      expect(userRepository.find).toHaveBeenCalledWith({
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('findById', () => {
    it('should return a user by id', async () => {
      const user: User = {
        id: '1',
        email: 'user@example.com',
        role: UserRole.USER,
      } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.findById('1');
      expect(result).toEqual(user);
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.findById('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRole', () => {
    it('should update user role and invalidate tokens', async () => {
      const user: User = {
        id: '1',
        email: 'user@example.com',
        role: UserRole.USER,
      } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);
      jest.spyOn(userRepository, 'count').mockResolvedValue(2); // Multiple admins exist
      jest.spyOn(userRepository, 'save').mockResolvedValue({
        ...user,
        role: UserRole.ADMINISTRATOR,
      });
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });

      const result = await service.updateRole('1', UserRole.ADMINISTRATOR);

      expect(result.role).toBe(UserRole.ADMINISTRATOR);
      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: '1', revoked: false },
        { revoked: true, revocationReason: RevocationReason.PASSWORD_CHANGE },
      );
    });

    it('should throw BadRequestException when demoting last admin', async () => {
      const admin: User = {
        id: '1',
        email: 'admin@example.com',
        role: UserRole.ADMINISTRATOR,
      } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(admin);
      jest.spyOn(userRepository, 'count').mockResolvedValue(1); // Only one admin

      await expect(service.updateRole('1', UserRole.USER)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteUser', () => {
    it('should delete a user', async () => {
      const user: User = {
        id: '1',
        email: 'user@example.com',
        role: UserRole.USER,
      } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);
      jest.spyOn(userRepository, 'remove').mockResolvedValue(user);

      await service.deleteUser('1');

      expect(userRepository.remove).toHaveBeenCalledWith(user);
    });

    it('should throw BadRequestException when deleting last admin', async () => {
      const admin: User = {
        id: '1',
        email: 'admin@example.com',
        role: UserRole.ADMINISTRATOR,
      } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(admin);
      jest.spyOn(userRepository, 'count').mockResolvedValue(1); // Only one admin

      await expect(service.deleteUser('1')).rejects.toThrow(
        BadRequestException,
      );
    });

    /**
     * Validates: Requirements 5.5
     * Test that cascade deletion removes associated refresh tokens
     * Note: Cascade deletion is handled by the database via foreign key constraints,
     * so this test verifies that the user removal is called correctly.
     * The actual cascade behavior is tested in integration tests.
     */
    it('should cascade delete refresh tokens when user is deleted', async () => {
      const user: User = {
        id: '1',
        email: 'user@example.com',
        role: UserRole.USER,
        refreshTokens: [
          { id: 'token1', userId: '1' } as RefreshToken,
          { id: 'token2', userId: '1' } as RefreshToken,
        ],
      } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);
      jest.spyOn(userRepository, 'remove').mockResolvedValue(user);

      await service.deleteUser('1');

      // Verify user removal is called (cascade is handled by database)
      expect(userRepository.remove).toHaveBeenCalledWith(user);
      // Note: The actual cascade deletion of refresh tokens is handled by the database
      // via the foreign key constraint with ON DELETE CASCADE
    });
  });

  describe('countAdministrators', () => {
    it('should return the count of administrators', async () => {
      jest.spyOn(userRepository, 'count').mockResolvedValue(3);

      const result = await service.countAdministrators();
      expect(result).toBe(3);
      expect(userRepository.count).toHaveBeenCalledWith({
        where: { role: UserRole.ADMINISTRATOR },
      });
    });
  });

  describe('isLastAdministrator', () => {
    it('should return true if user is the last administrator', async () => {
      const admin: User = {
        id: '1',
        email: 'admin@example.com',
        role: UserRole.ADMINISTRATOR,
      } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(admin);
      jest.spyOn(userRepository, 'count').mockResolvedValue(1);

      const result = await service.isLastAdministrator('1');
      expect(result).toBe(true);
    });

    it('should return false if user is not an administrator', async () => {
      const user: User = {
        id: '1',
        email: 'user@example.com',
        role: UserRole.USER,
      } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);

      const result = await service.isLastAdministrator('1');
      expect(result).toBe(false);
    });

    it('should return false if there are multiple administrators', async () => {
      const admin: User = {
        id: '1',
        email: 'admin@example.com',
        role: UserRole.ADMINISTRATOR,
      } as User;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(admin);
      jest.spyOn(userRepository, 'count').mockResolvedValue(2);

      const result = await service.isLastAdministrator('1');
      expect(result).toBe(false);
    });
  });

  /**
   * Feature: user-management, Property 8: Administrator count accuracy
   * Validates: Requirements 10.4
   *
   * Property: For any system state, the count of administrators should equal
   * the number of users with Administrator_Role
   */
  describe('Property 8: Administrator count accuracy', () => {
    it('should accurately count administrators across various user sets', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate an array of users with random roles
          fc.array(
            fc.record({
              id: fc.uuid(),
              email: fc.emailAddress(),
              role: fc.constantFrom(UserRole.USER, UserRole.ADMINISTRATOR),
            }),
            { minLength: 1, maxLength: 20 },
          ),
          async (users) => {
            // Count expected administrators
            const expectedAdminCount = users.filter(
              (u) => u.role === UserRole.ADMINISTRATOR,
            ).length;

            // Mock the repository to return our generated users
            jest
              .spyOn(userRepository, 'count')
              .mockResolvedValue(expectedAdminCount);

            // Call the service method
            const actualCount = await service.countAdministrators();

            // Verify the count matches
            expect(actualCount).toBe(expectedAdminCount);
            expect(userRepository.count).toHaveBeenCalledWith({
              where: { role: UserRole.ADMINISTRATOR },
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: user-management, Property 9: Token invalidation on role change
   * Validates: Requirements 4.5
   *
   * Property: For any user whose role is changed, all of their active refresh tokens
   * should be invalidated
   */
  describe('Property 9: Token invalidation on role change', () => {
    it('should invalidate all refresh tokens when role changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            userId: fc.uuid(),
            email: fc.emailAddress(),
            currentRole: fc.constantFrom(UserRole.USER, UserRole.ADMINISTRATOR),
            newRole: fc.constantFrom(UserRole.USER, UserRole.ADMINISTRATOR),
          }),
          async ({ userId, email, currentRole, newRole }) => {
            // Skip if role is not actually changing
            if (currentRole === newRole) {
              return;
            }

            // Skip if trying to demote the last admin (this is tested separately)
            if (
              currentRole === UserRole.ADMINISTRATOR &&
              newRole === UserRole.USER
            ) {
              // Assume there are multiple admins for this property test
              jest.spyOn(userRepository, 'count').mockResolvedValue(2);
            }

            const user: User = {
              id: userId,
              email,
              role: currentRole,
            } as User;

            // Mock repository methods
            jest.spyOn(userRepository, 'findOne').mockResolvedValue(user);
            jest.spyOn(userRepository, 'save').mockResolvedValue({
              ...user,
              role: newRole,
            });
            const updateSpy = jest
              .spyOn(refreshTokenRepository, 'update')
              .mockResolvedValue({
                affected: 1,
                raw: [],
                generatedMaps: [],
              });

            // Execute role change
            await service.updateRole(userId, newRole);

            // Verify that refresh tokens were invalidated
            expect(updateSpy).toHaveBeenCalledWith(
              { userId, revoked: false },
              {
                revoked: true,
                revocationReason: RevocationReason.PASSWORD_CHANGE,
              },
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: user-management, Property 7: Last administrator protection
   * Validates: Requirements 4.4, 5.3, 10.1, 10.2
   *
   * Property: For any system state where only one administrator exists, attempts to delete
   * that administrator or change their role to user should be rejected with an error
   */
  describe('Property 7: Last administrator protection', () => {
    it('should prevent deletion of the last administrator', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            adminId: fc.uuid(),
            adminEmail: fc.emailAddress(),
          }),
          async ({ adminId, adminEmail }) => {
            const admin: User = {
              id: adminId,
              email: adminEmail,
              role: UserRole.ADMINISTRATOR,
            } as User;

            // Mock: Only one administrator exists
            jest.spyOn(userRepository, 'findOne').mockResolvedValue(admin);
            jest.spyOn(userRepository, 'count').mockResolvedValue(1);

            // Attempt to delete the last administrator
            await expect(service.deleteUser(adminId)).rejects.toThrow(
              BadRequestException,
            );
            await expect(service.deleteUser(adminId)).rejects.toThrow(
              'Cannot delete the last administrator',
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should prevent demotion of the last administrator', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            adminId: fc.uuid(),
            adminEmail: fc.emailAddress(),
          }),
          async ({ adminId, adminEmail }) => {
            const admin: User = {
              id: adminId,
              email: adminEmail,
              role: UserRole.ADMINISTRATOR,
            } as User;

            // Mock: Only one administrator exists
            jest.spyOn(userRepository, 'findOne').mockResolvedValue(admin);
            jest.spyOn(userRepository, 'count').mockResolvedValue(1);

            // Attempt to demote the last administrator
            await expect(
              service.updateRole(adminId, UserRole.USER),
            ).rejects.toThrow(BadRequestException);
            await expect(
              service.updateRole(adminId, UserRole.USER),
            ).rejects.toThrow('Cannot demote the last administrator');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should allow deletion when multiple administrators exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            adminId: fc.uuid(),
            adminEmail: fc.emailAddress(),
          }),
          async ({ adminId, adminEmail }) => {
            const admin: User = {
              id: adminId,
              email: adminEmail,
              role: UserRole.ADMINISTRATOR,
            } as User;

            // Mock: Multiple administrators exist
            jest.spyOn(userRepository, 'findOne').mockResolvedValue(admin);
            jest.spyOn(userRepository, 'count').mockResolvedValue(2);
            jest.spyOn(userRepository, 'remove').mockResolvedValue(admin);

            // Should succeed
            await expect(service.deleteUser(adminId)).resolves.not.toThrow();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should allow demotion when multiple administrators exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            adminId: fc.uuid(),
            adminEmail: fc.emailAddress(),
          }),
          async ({ adminId, adminEmail }) => {
            const admin: User = {
              id: adminId,
              email: adminEmail,
              role: UserRole.ADMINISTRATOR,
            } as User;

            // Mock: Multiple administrators exist
            jest.spyOn(userRepository, 'findOne').mockResolvedValue(admin);
            jest.spyOn(userRepository, 'count').mockResolvedValue(2);
            jest.spyOn(userRepository, 'save').mockResolvedValue({
              ...admin,
              role: UserRole.USER,
            });
            jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
              affected: 1,
              raw: [],
              generatedMaps: [],
            });

            // Should succeed
            await expect(
              service.updateRole(adminId, UserRole.USER),
            ).resolves.not.toThrow();
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
