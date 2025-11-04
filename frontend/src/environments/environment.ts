// Development environment configuration
export const environment = {
  production: false,
  apiUrl: '/api', // Proxied to http://localhost:3000 in development
  tokenRefreshBuffer: 60000, // Refresh token 1 minute before expiry (in milliseconds)
};
