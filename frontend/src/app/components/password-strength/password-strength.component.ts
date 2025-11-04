import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MaterialModule } from '../../shared/material.module';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_CHARS,
  PASSWORD_SPECIAL_CHARS_REGEX,
} from '../../constants/password.constants';

@Component({
  selector: 'app-password-strength',
  standalone: true,
  imports: [CommonModule, MaterialModule],
  templateUrl: './password-strength.component.html',
  styleUrls: ['./password-strength.component.scss'],
})
export class PasswordStrengthComponent {
  @Input() password: string = '';

  get hasMinLength(): boolean {
    return this.password.length >= PASSWORD_MIN_LENGTH;
  }

  get hasUppercase(): boolean {
    return /[A-Z]/.test(this.password);
  }

  get hasLowercase(): boolean {
    return /[a-z]/.test(this.password);
  }

  get hasNumber(): boolean {
    return /\d/.test(this.password);
  }

  get hasSpecial(): boolean {
    return PASSWORD_SPECIAL_CHARS_REGEX.test(this.password);
  }

  get minLength(): number {
    return PASSWORD_MIN_LENGTH;
  }

  get specialChars(): string {
    return PASSWORD_SPECIAL_CHARS;
  }

  get strength(): 'weak' | 'medium' | 'strong' {
    const checks = [this.hasMinLength, this.hasUppercase, this.hasLowercase, this.hasNumber, this.hasSpecial];
    const passedChecks = checks.filter((check) => check).length;

    if (passedChecks <= 2) {
      return 'weak';
    } else if (passedChecks <= 4) {
      return 'medium';
    } else {
      return 'strong';
    }
  }

  get strengthClass(): string {
    return `strength-${this.strength}`;
  }

  get strengthPercentage(): number {
    const checks = [this.hasMinLength, this.hasUppercase, this.hasLowercase, this.hasNumber, this.hasSpecial];
    const passedChecks = checks.filter((check) => check).length;
    return (passedChecks / checks.length) * 100;
  }
}
