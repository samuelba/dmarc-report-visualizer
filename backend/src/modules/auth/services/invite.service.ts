import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { InviteToken } from '../entities/invite-token.entity';
import { User } from '../entities/user.entity';
import { UserRole } from '../enums/user-role.enum';
import { PasswordService } from './password.service';

@Injectable()
export class InviteService {
  constructor(
    @InjectRepository(InviteToken)
    private readonly inviteTokenRepository: Repository<InviteToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Create a new invite token
   */
  async createInvite(
    email: string,
    role: UserRole,
    createdById: string,
  ): Promise<InviteToken & { token: string }> {
    // Check if user with this email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    // Generate unique token
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);

    // Set 7-day expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create invite
    const invite = this.inviteTokenRepository.create({
      tokenHash,
      email,
      role,
      expiresAt,
      createdById,
    });

    const savedInvite = await this.inviteTokenRepository.save(invite);

    // Return invite with raw token (not stored in DB)
    return {
      ...savedInvite,
      token,
    } as InviteToken & { token: string };
  }

  /**
   * Find all active (non-expired, unused) invites
   */
  async findAllActive(): Promise<InviteToken[]> {
    return this.inviteTokenRepository.find({
      where: {
        used: false,
      },
      relations: ['createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find an invite by token hash
   */
  async findByTokenHash(tokenHash: string): Promise<InviteToken | null> {
    return this.inviteTokenRepository.findOne({
      where: { tokenHash },
      relations: ['createdBy'],
    });
  }

  /**
   * Validate an invite token
   */
  async validateInvite(
    token: string,
  ): Promise<{ valid: boolean; invite?: InviteToken; error?: string }> {
    const tokenHash = this.hashToken(token);
    const invite = await this.findByTokenHash(tokenHash);

    if (!invite) {
      return { valid: false, error: 'Invalid invitation token' };
    }

    if (invite.used) {
      return { valid: false, error: 'This invitation has already been used' };
    }

    if (new Date() > invite.expiresAt) {
      return { valid: false, error: 'This invitation has expired' };
    }

    // Check if email is now taken (someone else registered with this email)
    const existingUser = await this.userRepository.findOne({
      where: { email: invite.email },
    });
    if (existingUser) {
      return {
        valid: false,
        error: 'A user with this email already exists',
      };
    }

    return { valid: true, invite };
  }

  /**
   * Accept an invite and create a user
   */
  async acceptInvite(token: string, password: string): Promise<User> {
    const validation = await this.validateInvite(token);

    if (!validation.valid || !validation.invite) {
      throw new BadRequestException(validation.error || 'Invalid invitation');
    }

    const invite = validation.invite;

    // Hash password
    const passwordHash = await this.passwordService.hashPassword(password);

    // Create user
    const user = this.userRepository.create({
      email: invite.email,
      passwordHash,
      role: invite.role,
      authProvider: 'local',
    });

    const savedUser = await this.userRepository.save(user);

    // Mark invite as used
    invite.used = true;
    invite.usedAt = new Date();
    invite.usedBy = savedUser.id;
    await this.inviteTokenRepository.save(invite);

    return savedUser;
  }

  /**
   * Revoke an invite (mark as used to prevent acceptance)
   */
  async revokeInvite(id: string): Promise<void> {
    const invite = await this.inviteTokenRepository.findOne({
      where: { id },
    });

    if (!invite) {
      throw new NotFoundException(`Invite with ID ${id} not found`);
    }

    invite.used = true;
    invite.usedAt = new Date();
    await this.inviteTokenRepository.save(invite);
  }

  /**
   * Cleanup expired invites (scheduled job)
   */
  async cleanupExpiredInvites(): Promise<void> {
    const now = new Date();
    await this.inviteTokenRepository.delete({
      expiresAt: LessThan(now),
    });
  }

  /**
   * Generate a cryptographically secure random token
   */
  private generateToken(): string {
    // Generate 32 bytes (256 bits) of random data
    const buffer = randomBytes(32);
    // Convert to base64url encoding (URL-safe)
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Hash a token using SHA-256
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
