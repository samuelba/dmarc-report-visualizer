export interface AuthResponse {
  // Note: Access token and refresh token are set in HttpOnly cookies, not returned in body
  user: {
    id: string;
    email: string;
    authProvider: string;
  };
}

export interface TotpRequiredResponse {
  totpRequired: true;
  tempToken: string; // Used internally by controller to set HttpOnly cookie, not returned in HTTP response body
}
