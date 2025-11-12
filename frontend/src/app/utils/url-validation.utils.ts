/**
 * Validate that a return URL is safe for redirection
 * Prevents open redirect vulnerabilities
 *
 * @param url The URL to validate
 * @returns true if the URL is safe, false otherwise
 */
export function isValidReturnUrl(url: string | null): boolean {
  if (!url) {
    return false;
  }

  // Normalize the URL by decoding and removing whitespace
  let normalizedUrl = url.trim();

  // Decode URL-encoded characters to prevent bypass techniques
  try {
    // Decode multiple times to catch double-encoding
    let previousUrl = '';
    let iterations = 0;
    while (normalizedUrl !== previousUrl && iterations < 5) {
      previousUrl = normalizedUrl;
      normalizedUrl = decodeURIComponent(normalizedUrl);
      iterations++;
    }
  } catch (_e) {
    // If decoding fails, reject the URL
    return false;
  }

  normalizedUrl = normalizedUrl.trim().toLowerCase();

  // Must start with '/' (relative path)
  if (!normalizedUrl.startsWith('/')) {
    return false;
  }

  // Must not start with '//' (protocol-relative URL)
  if (normalizedUrl.startsWith('//')) {
    return false;
  }

  // Check for backslash bypass attempts (e.g., /\evil.com)
  if (normalizedUrl.includes('\\')) {
    return false;
  }

  // Check for dangerous protocols (comprehensive list)
  const dangerousProtocols = [
    'javascript:',
    'data:',
    'vbscript:',
    'file:',
    'about:',
    'blob:',
    'http://',
    'https://',
    'ftp://',
    'mailto:',
    'tel:',
  ];

  for (const protocol of dangerousProtocols) {
    if (normalizedUrl.includes(protocol)) {
      return false;
    }
  }

  // Check for protocol indicators with various separators
  if (normalizedUrl.match(/[a-z]+:/i)) {
    return false;
  }

  // Check for @ symbol which could indicate user info in URL (e.g., /@attacker.com)
  if (normalizedUrl.includes('@')) {
    return false;
  }

  // Must not be login or setup pages (check original URL case-insensitively)
  const originalLower = url.trim().toLowerCase();
  if (originalLower.startsWith('/login') || originalLower.startsWith('/setup')) {
    return false;
  }

  // Additional check: ensure the path is well-formed
  try {
    const testUrl = new URL(normalizedUrl, 'http://localhost');
    // Verify the pathname starts with / and doesn't have suspicious patterns
    if (!testUrl.pathname.startsWith('/') || testUrl.pathname.startsWith('//')) {
      return false;
    }
  } catch (_e) {
    return false;
  }

  return true;
}

/**
 * Get and validate the return URL from session storage
 * Returns validated URL or default fallback
 *
 * @param fallbackUrl The URL to return if no valid return URL is found (default: '/dashboard')
 * @returns The validated return URL or fallback
 */
export function getValidatedReturnUrl(fallbackUrl: string = '/dashboard'): string {
  const returnUrl = sessionStorage.getItem('returnUrl');

  if (!returnUrl) {
    return fallbackUrl;
  }

  if (isValidReturnUrl(returnUrl)) {
    return returnUrl;
  }

  // Log security warning for invalid URLs
  console.warn('Invalid return URL detected and rejected:', returnUrl);
  return fallbackUrl;
}

/**
 * Clear the stored return URL from session storage
 */
export function clearReturnUrl(): void {
  sessionStorage.removeItem('returnUrl');
}
