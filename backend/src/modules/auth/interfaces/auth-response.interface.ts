export interface AuthResponse {
  // Note: Access token and refresh token are set in HttpOnly cookies, not returned in body
  user: {
    id: string;
    email: string;
    authProvider: string;
  };
}
