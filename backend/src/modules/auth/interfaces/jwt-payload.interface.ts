export interface JwtPayload {
  sub: string; // user id
  email: string;
  authProvider: string;
  organizationId?: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string; // user id
  tokenId: string; // refresh token id in database
  iat?: number;
  exp?: number;
}
