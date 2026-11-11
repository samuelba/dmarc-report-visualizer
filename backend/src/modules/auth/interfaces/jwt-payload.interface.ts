export const TOKEN_TYPE = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  TOTP_TEMP: 'totp_temp',
} as const;

export type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string; // user role
  authProvider: string;
  organizationId?: string;
  type: typeof TOKEN_TYPE.ACCESS;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string; // user id
  tokenId: string; // refresh token id in database
  type: typeof TOKEN_TYPE.REFRESH;
  iat?: number;
  exp?: number;
}

export interface TempTokenPayload {
  sub: string; // user id
  email: string;
  type: typeof TOKEN_TYPE.TOTP_TEMP;
  iat?: number;
  exp?: number;
}
