import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_CHARS,
  PASSWORD_SPECIAL_CHARS_REGEX,
} from '../constants/auth.constants';

interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

interface ParsedHash {
  algorithm: string;
  hash: string;
}

@Injectable()
export class PasswordService {
  private readonly bcryptRounds: number;

  constructor(private readonly configService: ConfigService) {
    this.bcryptRounds = parseInt(
      this.configService.get<string>('BCRYPT_ROUNDS', '10'),
      10,
    );
  }

  /**
   * Hash a password using bcrypt with algorithm prefix format
   * Format: bcrypt$<bcrypt_output>
   */
  async hashPassword(password: string): Promise<string> {
    const bcryptHash = await bcrypt.hash(password, this.bcryptRounds);
    return this.formatHash('bcrypt', bcryptHash);
  }

  /**
   * Validate a password against a stored hash
   * Parses the hash format to extract algorithm and hash
   */
  async validatePassword(
    password: string,
    storedHash: string,
  ): Promise<boolean> {
    const parsed = this.parseHash(storedHash);

    if (parsed.algorithm === 'bcrypt') {
      // For bcrypt, the hash part contains the full bcrypt output
      return await bcrypt.compare(password, parsed.hash);
    }

    // Future algorithms can be added here
    throw new Error(`Unsupported hash algorithm: ${parsed.algorithm}`);
  }

  /**
   * Validate password strength according to requirements
   * Requirements:
   * - Minimum 12 characters
   * - At least one uppercase letter
   * - At least one lowercase letter
   * - At least one number
   * - At least one special character
   */
  validatePasswordStrength(password: string): PasswordValidationResult {
    const errors: string[] = [];

    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.push(
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
      );
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!PASSWORD_SPECIAL_CHARS_REGEX.test(password)) {
      errors.push(
        `Password must contain at least one special character (${PASSWORD_SPECIAL_CHARS})`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse a hash string to extract algorithm and hash components
   * Format: <algorithm>$<hash>
   */
  private parseHash(storedHash: string): ParsedHash {
    const parts = storedHash.split('$');

    if (parts.length < 2) {
      throw new Error('Invalid hash format');
    }

    const algorithm = parts[0];
    // For bcrypt, everything after the algorithm prefix is the bcrypt hash
    const hash = parts.slice(1).join('$');

    return {
      algorithm,
      hash,
    };
  }

  /**
   * Format a hash with algorithm prefix
   * Format: <algorithm>$<hash>
   */
  private formatHash(algorithm: string, hash: string): string {
    return `${algorithm}$${hash}`;
  }
}
