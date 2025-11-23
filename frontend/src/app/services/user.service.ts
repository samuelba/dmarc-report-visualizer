import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserRole } from '../models/user-role.enum';

// Re-export UserRole for convenience
export { UserRole };

export interface UserResponse {
  id: string;
  email: string;
  role: UserRole;
  authProvider: string;
  createdAt: Date;
  totpEnabled: boolean;
}

export interface InviteToken {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

export interface InviteResponse {
  id: string;
  email: string;
  role: UserRole;
  inviteLink: string;
  expiresAt: Date;
  emailStatus: 'sent' | 'failed' | 'not_configured';
}

export interface InviteDetailsResponse {
  valid: boolean;
  email?: string;
  role?: UserRole;
  expiresAt?: Date;
  error?: string;
}

export interface CreateInviteDto {
  email: string;
  role: UserRole;
}

export interface AcceptInviteDto {
  password: string;
  passwordConfirmation: string;
}

export interface UpdateRoleDto {
  role: UserRole;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    authProvider: string;
    role: UserRole;
  };
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/api/auth';

  /**
   * Get all users in the system (admin only)
   */
  getAllUsers(): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(`${this.apiBase}/users`);
  }

  /**
   * Update a user's role (admin only)
   */
  updateUserRole(userId: string, role: UserRole): Observable<UserResponse> {
    const dto: UpdateRoleDto = { role };
    return this.http.put<UserResponse>(`${this.apiBase}/users/${userId}/role`, dto);
  }

  /**
   * Delete a user (admin only)
   */
  deleteUser(userId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/users/${userId}`);
  }

  /**
   * Create an invite for a new user (admin only)
   */
  createInvite(email: string, role: UserRole): Observable<InviteResponse> {
    const dto: CreateInviteDto = { email, role };
    return this.http.post<InviteResponse>(`${this.apiBase}/users/invite`, dto);
  }

  /**
   * Get all active invites (admin only)
   */
  getActiveInvites(): Observable<InviteToken[]> {
    return this.http.get<InviteToken[]>(`${this.apiBase}/invites`);
  }

  /**
   * Revoke an invite (admin only)
   */
  revokeInvite(inviteId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/invites/${inviteId}`);
  }

  /**
   * Get invite details by token (public)
   */
  getInviteDetails(token: string): Observable<InviteDetailsResponse> {
    return this.http.get<InviteDetailsResponse>(`${this.apiBase}/invite/${token}`);
  }

  /**
   * Accept an invite and create account (public)
   */
  acceptInvite(token: string, password: string, passwordConfirmation: string): Observable<AuthResponse> {
    const dto: AcceptInviteDto = { password, passwordConfirmation };
    return this.http.post<AuthResponse>(`${this.apiBase}/invite/${token}/accept`, dto);
  }
}
