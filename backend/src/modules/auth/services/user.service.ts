import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { UserRole } from '../enums/user-role.enum';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  /**
   * Find all users in the system
   */
  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Find a user by ID
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * Update a user's role
   */
  async updateRole(id: string, role: UserRole): Promise<User> {
    await this.validateRoleChange(id, role);

    const user = await this.findById(id);
    user.role = role;
    await this.userRepository.save(user);

    // Invalidate all refresh tokens for this user to force re-authentication
    await this.refreshTokenRepository.update(
      { userId: id, revoked: false },
      { revoked: true, revocationReason: 'password_change' as any },
    );

    return user;
  }

  /**
   * Delete a user
   */
  async deleteUser(id: string): Promise<void> {
    await this.validateUserDeletion(id);

    const user = await this.findById(id);
    await this.userRepository.remove(user);
    // Refresh tokens will be cascade deleted by the database
  }

  /**
   * Count the number of administrators in the system
   */
  async countAdministrators(): Promise<number> {
    return this.userRepository.count({
      where: { role: UserRole.ADMINISTRATOR },
    });
  }

  /**
   * Check if a user is the last administrator
   */
  async isLastAdministrator(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (user.role !== UserRole.ADMINISTRATOR) {
      return false;
    }

    const adminCount = await this.countAdministrators();
    return adminCount === 1;
  }

  /**
   * Validate that a role change is allowed
   * Throws an error if the change would violate last admin protection
   */
  async validateRoleChange(userId: string, newRole: UserRole): Promise<void> {
    if (newRole === UserRole.USER) {
      const isLast = await this.isLastAdministrator(userId);
      if (isLast) {
        throw new BadRequestException(
          'Cannot demote the last administrator. At least one administrator must exist.',
        );
      }
    }
  }

  /**
   * Validate that a user deletion is allowed
   * Throws an error if the deletion would violate last admin protection
   */
  async validateUserDeletion(userId: string): Promise<void> {
    const isLast = await this.isLastAdministrator(userId);
    if (isLast) {
      throw new BadRequestException(
        'Cannot delete the last administrator. At least one administrator must exist.',
      );
    }
  }
}
