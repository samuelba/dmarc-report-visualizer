import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';

export type ApiTokenScope = 'mcp:read' | 'mcp:raw_xml';
export type ApiTokenStatus = 'active' | 'expired' | 'revoked';

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revokedAt: string | null;
}

export interface AdminApiToken extends ApiToken {
  userId: string;
  userEmail: string | null;
}

export interface CreateApiTokenRequest {
  name: string;
  expiresInDays: number;
  allowRawXml: boolean;
}

export interface CreatedApiToken {
  token: string;
  apiToken: ApiToken;
}

export function tokenStatus(token: ApiToken, now: Date = new Date()): ApiTokenStatus {
  if (token.revokedAt) {
    return 'revoked';
  }
  return new Date(token.expiresAt).getTime() <= now.getTime() ? 'expired' : 'active';
}

/**
 * Personal API tokens for the MCP server. The backend only has these routes
 * when MCP_ENABLED=true; the list calls return null when it is off.
 */
@Injectable({ providedIn: 'root' })
export class ApiTokenService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/auth/api-tokens';

  listOwn(): Observable<ApiToken[] | null> {
    return this.http.get<ApiToken[]>(this.base).pipe(nullWhenDisabled());
  }

  /** Whether the server has the MCP feature turned on. */
  isEnabled(): Observable<boolean> {
    return this.listOwn().pipe(
      map((tokens) => tokens !== null),
      catchError(() => of(false))
    );
  }

  create(request: CreateApiTokenRequest): Observable<CreatedApiToken> {
    return this.http.post<CreatedApiToken>(this.base, request);
  }

  revoke(id: string): Observable<ApiToken> {
    return this.http.delete<ApiToken>(`${this.base}/${encodeURIComponent(id)}`);
  }

  revokeAll(): Observable<{ revoked: number }> {
    return this.http.delete<{ revoked: number }>(this.base);
  }

  listAll(): Observable<AdminApiToken[] | null> {
    return this.http.get<AdminApiToken[]>(`${this.base}/all`).pipe(nullWhenDisabled());
  }

  revokeAny(id: string): Observable<ApiToken> {
    return this.http.delete<ApiToken>(`${this.base}/all/${encodeURIComponent(id)}`);
  }

  mcpEndpointUrl(): string {
    return `${window.location.origin}/api/mcp`;
  }
}

function nullWhenDisabled<T>() {
  return catchError<T, Observable<T | null>>((error: unknown) =>
    error instanceof HttpErrorResponse && error.status === 404 ? of(null) : throwError(() => error)
  );
}
