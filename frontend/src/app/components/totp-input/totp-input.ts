import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MaterialModule } from '../../shared/material.module';

@Component({
  selector: 'app-totp-input',
  standalone: true,
  imports: [CommonModule, FormsModule, MaterialModule],
  templateUrl: './totp-input.html',
  styleUrls: ['./totp-input.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TotpInputComponent),
      multi: true,
    },
  ],
})
export class TotpInputComponent implements ControlValueAccessor {
  @Input() label = 'Verification Code';
  @Input() placeholder = '000000';
  @Input() hint = 'Enter the 6-digit code from your authenticator app';
  @Input() disabled = false;
  @Input() autofocus = false;

  value = '';
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    // Only allow numeric input
    input.value = input.value.replace(/[^0-9]/g, '');
    this.value = input.value;
    this.onChange(this.value);
    this.onTouched();
  }

  // ControlValueAccessor implementation
  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  get isValid(): boolean {
    return this.value.length === 6 && /^\d{6}$/.test(this.value);
  }
}
