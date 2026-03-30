import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { PasswordStrengthComponent } from './password-strength.component';

describe('PasswordStrengthComponent', () => {
  let component: PasswordStrengthComponent;
  let fixture: ComponentFixture<PasswordStrengthComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PasswordStrengthComponent, BrowserAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(PasswordStrengthComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('hasMinLength', () => {
    it('should return false for short passwords', () => {
      component.password = 'abc';
      expect(component.hasMinLength).toBe(false);
    });

    it('should return true for passwords meeting min length', () => {
      component.password = 'a'.repeat(component.minLength);
      expect(component.hasMinLength).toBe(true);
    });
  });

  describe('hasUppercase', () => {
    it('should return false without uppercase', () => {
      component.password = 'lowercase123';
      expect(component.hasUppercase).toBe(false);
    });

    it('should return true with uppercase', () => {
      component.password = 'Uppercase123';
      expect(component.hasUppercase).toBe(true);
    });
  });

  describe('hasLowercase', () => {
    it('should return false without lowercase', () => {
      component.password = 'UPPERCASE123';
      expect(component.hasLowercase).toBe(false);
    });

    it('should return true with lowercase', () => {
      component.password = 'UPPERCASEa123';
      expect(component.hasLowercase).toBe(true);
    });
  });

  describe('hasNumber', () => {
    it('should return false without number', () => {
      component.password = 'NoNumbers';
      expect(component.hasNumber).toBe(false);
    });

    it('should return true with number', () => {
      component.password = 'Has1Number';
      expect(component.hasNumber).toBe(true);
    });
  });

  describe('hasSpecial', () => {
    it('should return false without special chars', () => {
      component.password = 'NoSpecial123';
      expect(component.hasSpecial).toBe(false);
    });

    it('should return true with special chars', () => {
      component.password = 'Has@Special';
      expect(component.hasSpecial).toBe(true);
    });
  });

  describe('strength', () => {
    it('should be weak with empty password', () => {
      component.password = '';
      expect(component.strength).toBe('weak');
    });

    it('should be weak with only 1-2 checks passing', () => {
      component.password = 'ab';
      expect(component.strength).toBe('weak');
    });

    it('should be medium with 3-4 checks passing', () => {
      component.password = 'Abcdefghijkl1';
      expect(component.strength).toBe('medium');
    });

    it('should be strong with all checks passing', () => {
      component.password = 'Abcdefghijkl1@';
      expect(component.strength).toBe('strong');
    });
  });

  describe('strengthClass', () => {
    it('should return strength-weak', () => {
      component.password = '';
      expect(component.strengthClass).toBe('strength-weak');
    });

    it('should return strength-strong', () => {
      component.password = 'Abcdefghijkl1@';
      expect(component.strengthClass).toBe('strength-strong');
    });
  });

  describe('strengthPercentage', () => {
    it('should be 0 for empty password', () => {
      component.password = '';
      expect(component.strengthPercentage).toBe(0);
    });

    it('should be 100 for strong password', () => {
      component.password = 'Abcdefghijkl1@';
      expect(component.strengthPercentage).toBe(100);
    });

    it('should be between 0 and 100 for partial', () => {
      component.password = 'Abcdefgh';
      expect(component.strengthPercentage).toBeGreaterThan(0);
      expect(component.strengthPercentage).toBeLessThan(100);
    });
  });

  it('should expose specialChars constant', () => {
    expect(component.specialChars).toBeTruthy();
    expect(typeof component.specialChars).toBe('string');
  });

  it('should expose minLength constant', () => {
    expect(component.minLength).toBeGreaterThan(0);
  });
});
