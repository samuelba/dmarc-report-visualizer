export interface TokenResponse {
  accessToken: string;
  // Note: New refresh token is set in HttpOnly cookie, not returned in body
}
