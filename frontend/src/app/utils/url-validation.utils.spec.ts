import { isValidReturnUrl, getValidatedReturnUrl, clearReturnUrl } from './url-validation.utils';

describe('URL Validation Utils', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
  });

  afterEach(() => {
    // Clean up after each test
    sessionStorage.clear();
  });

  describe('isValidReturnUrl', () => {
    it('should accept valid relative URLs', () => {
      expect(isValidReturnUrl('/dashboard')).toBe(true);
      expect(isValidReturnUrl('/explore')).toBe(true);
      expect(isValidReturnUrl('/reports')).toBe(true);
      expect(isValidReturnUrl('/domains/123')).toBe(true);
    });

    it('should accept valid relative URLs with query parameters', () => {
      expect(isValidReturnUrl('/explore?recordId=123')).toBe(true);
      expect(isValidReturnUrl('/reports?startDate=2024-01-01&endDate=2024-01-31')).toBe(true);
      expect(isValidReturnUrl('/explore?recordId=e8dcd0fc-5743-4bce-8a42-9f1ae39a99c1')).toBe(true);
    });

    it('should accept valid relative URLs with hash fragments', () => {
      expect(isValidReturnUrl('/dashboard#section')).toBe(true);
      expect(isValidReturnUrl('/explore?id=123#details')).toBe(true);
    });

    it('should reject null or empty URLs', () => {
      expect(isValidReturnUrl(null)).toBe(false);
      expect(isValidReturnUrl('')).toBe(false);
    });

    it('should reject absolute URLs with http://', () => {
      expect(isValidReturnUrl('http://evil.com')).toBe(false);
      expect(isValidReturnUrl('http://evil.com/phishing')).toBe(false);
      expect(isValidReturnUrl('http://localhost:4200/dashboard')).toBe(false);
    });

    it('should reject absolute URLs with https://', () => {
      expect(isValidReturnUrl('https://evil.com')).toBe(false);
      expect(isValidReturnUrl('https://evil.com/phishing')).toBe(false);
      expect(isValidReturnUrl('https://example.com/dashboard')).toBe(false);
    });

    it('should reject protocol-relative URLs', () => {
      expect(isValidReturnUrl('//evil.com')).toBe(false);
      expect(isValidReturnUrl('//evil.com/phishing')).toBe(false);
      expect(isValidReturnUrl('//example.com/dashboard')).toBe(false);
    });

    it('should reject javascript: scheme', () => {
      expect(isValidReturnUrl('javascript:alert(1)')).toBe(false);
      expect(isValidReturnUrl('javascript:alert("xss")')).toBe(false);
      expect(isValidReturnUrl('JavaScript:alert(1)')).toBe(false);
      expect(isValidReturnUrl('JAVASCRIPT:alert(1)')).toBe(false);
    });

    it('should reject data: scheme', () => {
      expect(isValidReturnUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isValidReturnUrl('data:text/html,<h1>test</h1>')).toBe(false);
      expect(isValidReturnUrl('Data:text/html,test')).toBe(false);
      expect(isValidReturnUrl('DATA:text/html,test')).toBe(false);
    });

    it('should reject login page', () => {
      expect(isValidReturnUrl('/login')).toBe(false);
      expect(isValidReturnUrl('/login?error=invalid')).toBe(false);
      expect(isValidReturnUrl('/login#section')).toBe(false);
    });

    it('should reject setup page', () => {
      expect(isValidReturnUrl('/setup')).toBe(false);
      expect(isValidReturnUrl('/setup?step=1')).toBe(false);
      expect(isValidReturnUrl('/setup#section')).toBe(false);
    });

    it('should reject URLs that do not start with /', () => {
      expect(isValidReturnUrl('dashboard')).toBe(false);
      expect(isValidReturnUrl('explore?id=123')).toBe(false);
      expect(isValidReturnUrl('evil.com')).toBe(false);
    });
  });

  describe('getValidatedReturnUrl', () => {
    it('should return fallback when no return URL is stored', () => {
      expect(getValidatedReturnUrl()).toBe('/dashboard');
      expect(getValidatedReturnUrl('/home')).toBe('/home');
    });

    it('should return valid return URL from sessionStorage', () => {
      sessionStorage.setItem('returnUrl', '/explore?recordId=123');
      expect(getValidatedReturnUrl()).toBe('/explore?recordId=123');
    });

    it('should return fallback for invalid absolute URLs', () => {
      sessionStorage.setItem('returnUrl', 'https://evil.com');
      expect(getValidatedReturnUrl()).toBe('/dashboard');
    });

    it('should return fallback for invalid protocol-relative URLs', () => {
      sessionStorage.setItem('returnUrl', '//evil.com');
      expect(getValidatedReturnUrl()).toBe('/dashboard');
    });

    it('should return fallback for invalid javascript: scheme', () => {
      sessionStorage.setItem('returnUrl', 'javascript:alert(1)');
      expect(getValidatedReturnUrl()).toBe('/dashboard');
    });

    it('should return fallback for invalid data: scheme', () => {
      sessionStorage.setItem('returnUrl', 'data:text/html,<script>');
      expect(getValidatedReturnUrl()).toBe('/dashboard');
    });

    it('should return fallback for login page', () => {
      sessionStorage.setItem('returnUrl', '/login');
      expect(getValidatedReturnUrl()).toBe('/dashboard');
    });

    it('should return fallback for setup page', () => {
      sessionStorage.setItem('returnUrl', '/setup');
      expect(getValidatedReturnUrl()).toBe('/dashboard');
    });

    it('should return custom fallback when provided', () => {
      sessionStorage.setItem('returnUrl', 'https://evil.com');
      expect(getValidatedReturnUrl('/home')).toBe('/home');
    });

    it('should log security warning for invalid URLs', () => {
      spyOn(console, 'warn');
      sessionStorage.setItem('returnUrl', 'https://evil.com');
      getValidatedReturnUrl();
      expect(console.warn).toHaveBeenCalledWith('Invalid return URL detected and rejected:', 'https://evil.com');
    });

    it('should not log warning for missing URLs', () => {
      spyOn(console, 'warn');
      getValidatedReturnUrl();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('should not log warning for valid URLs', () => {
      spyOn(console, 'warn');
      sessionStorage.setItem('returnUrl', '/explore?recordId=123');
      getValidatedReturnUrl();
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('clearReturnUrl', () => {
    it('should remove return URL from sessionStorage', () => {
      sessionStorage.setItem('returnUrl', '/explore?recordId=123');
      expect(sessionStorage.getItem('returnUrl')).toBe('/explore?recordId=123');

      clearReturnUrl();
      expect(sessionStorage.getItem('returnUrl')).toBeNull();
    });

    it('should not throw error when no return URL exists', () => {
      expect(() => clearReturnUrl()).not.toThrow();
    });

    it('should only remove returnUrl key, not other sessionStorage items', () => {
      sessionStorage.setItem('returnUrl', '/explore');
      sessionStorage.setItem('otherKey', 'otherValue');

      clearReturnUrl();

      expect(sessionStorage.getItem('returnUrl')).toBeNull();
      expect(sessionStorage.getItem('otherKey')).toBe('otherValue');
    });
  });
});
