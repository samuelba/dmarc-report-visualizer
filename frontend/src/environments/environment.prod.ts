// Production environment configuration
export const environment = {
  production: true,
  apiUrl: '/api', // Should point to your production API endpoint
  tokenRefreshBuffer: 60000, // Refresh token 1 minute before expiry (in milliseconds)
};
