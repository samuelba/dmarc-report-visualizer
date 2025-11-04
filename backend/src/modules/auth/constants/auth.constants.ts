/**
 * Password validation constants
 */

/**
 * Minimum password length
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Allowed special characters for passwords.
 * This is the single source of truth.
 */
export const PASSWORD_SPECIAL_CHARS = '!@#$%^&*()-_+=?.,:;<>/';

/**
 * Escapes characters that have special meaning inside a regex character class [].
 * For our purposes, we just need to escape: ], \, ^, -
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
const escapeRegExpChars = (str: string) => {
  return str.replace(/[\\\]^-]/g, '\\$&');
};

/**
 * Escaped special characters for use in regex character class.
 */
const PASSWORD_SPECIAL_CHARS_ESCAPED = escapeRegExpChars(
  PASSWORD_SPECIAL_CHARS,
);

/**
 * Regex pattern for password special characters (for simple testing).
 */
export const PASSWORD_SPECIAL_CHARS_REGEX = new RegExp(
  `[${PASSWORD_SPECIAL_CHARS_ESCAPED}]`,
);

/**
 * Full password validation regex pattern for class-validator
 * Requires: lowercase, uppercase, digit, and special character.
 */
export const PASSWORD_VALIDATION_REGEX = new RegExp(
  // We need double backslashes for \d because it's inside a string
  `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[${PASSWORD_SPECIAL_CHARS_ESCAPED}])[A-Za-z\\d${PASSWORD_SPECIAL_CHARS_ESCAPED}]+$`,
);

/**
 * Password validation error message
 */
export const PASSWORD_VALIDATION_MESSAGE = `Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (${PASSWORD_SPECIAL_CHARS})`;
