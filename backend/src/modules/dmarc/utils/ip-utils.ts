/**
 * Utility functions for IP address validation and handling
 */

/**
 * Checks if an IP address is a public IP that can be looked up via geolocation services.
 * Returns false for private, loopback, link-local, and other special-use IP addresses.
 *
 * @param ip - The IP address to check (IPv4 or IPv6)
 * @returns true if the IP is a public IP, false otherwise
 */
export function supportsIp(ip: string): boolean {
  if (!ip) {
    return false; // Handle null/empty/undefined string
  }

  // --- IPv6 Private/Special Ranges ---

  // Loopback (::1) and unspecified (::)
  if (ip === '::1' || ip === '::') {
    return false;
  }

  // Unique Local Address (ULA) - fc00::/7 (e.g., fc00:0000:0000:0000:0000:0000:0000:0000 to fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff)
  // Simple check for the 'fc' or 'fd' prefix in the first segment
  // NOTE: A proper check requires parsing the full prefix, but this covers the most common ULA pattern.
  if (ip.startsWith('fc') || ip.startsWith('fd')) {
    // Check if it looks like an IPv6 address (contains ':') and starts with 'fc' or 'fd'
    if (ip.includes(':')) {
      // NOTE: This is a *simplification*. Fully correct ULA range checking is more complex.
      return false;
    }
  }

  // Link-Local (fe80::/10) - fe80:: to febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
  // Simple check for 'fe80:' prefix
  if (ip.startsWith('fe80:') && ip.includes(':')) {
    return false;
  }

  // Discard Prefix (100::/64) - RFC 6666
  if (ip.startsWith('100::') && ip.includes(':')) {
    return false;
  }

  // --- IPv4 Private Ranges ---

  // Check for IPv4-like pattern (contains '.')
  if (ip.includes('.')) {
    // Loopback: 127.0.0.0/8 (127.x.x.x)
    if (ip.startsWith('127.')) {
      return false;
    }

    // Class A Private: 10.0.0.0/8
    if (ip.startsWith('10.')) {
      return false;
    }

    // Class B Private: 172.16.0.0/12 (172.16.x.x to 172.31.x.x)
    // This requires a more precise check than the original's *many* `startsWith` calls.
    const parts = ip.split('.');
    if (parts.length === 4 && parts[0] === '172') {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return false;
      }
    }

    // Class C Private: 192.168.0.0/16
    if (ip.startsWith('192.168.')) {
      return false;
    }

    // Carrier Grade NAT (CGN): 100.64.0.0/10 (100.64.x.x to 100.127.x.x)
    if (parts.length === 4 && parts[0] === '100') {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 64 && secondOctet <= 127) {
        return false;
      }
    }

    // Link-Local/APIPA: 169.254.0.0/16
    if (ip.startsWith('169.254.')) {
      return false;
    }
  }

  // If none of the private/special checks returned false, assume it's a public IP.
  return true;
}
