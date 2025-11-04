/**
 * Password validation constants
 * These should match the backend validation rules
 */

/**
 * Minimum password length
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * Allowed special characters for passwords
 */
export const PASSWORD_SPECIAL_CHARS = '!@#$%^&*()-_+=?.,:;<>/';

/**
 * Escapes characters that have special meaning inside a regex character class [].
 * For our purposes, we just need to escape: ], \, ^, -
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
const escapeRegExpChars = (str: string): string => {
  return str.replace(/[\\\]^-]/g, '\\$&');
};

/**
 * Escaped special characters for use in regex character class.
 */
const PASSWORD_SPECIAL_CHARS_ESCAPED = escapeRegExpChars(PASSWORD_SPECIAL_CHARS);

/**
 * Regex pattern for password special characters (for simple testing).
 */
export const PASSWORD_SPECIAL_CHARS_REGEX = new RegExp(`[${PASSWORD_SPECIAL_CHARS_ESCAPED}]`);
