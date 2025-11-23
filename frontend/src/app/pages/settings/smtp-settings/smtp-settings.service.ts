import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SmtpConfigDto {
  host: string;
  port: number;
  securityMode: 'none' | 'tls' | 'starttls';
  username?: string;
  password?: string;
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
}

export interface SmtpConfigResponse {
  configured: boolean;
  enabled: boolean;
  host?: string;
  port?: number;
  securityMode?: string;
  username?: string;
  hasPassword: boolean;
  fromEmail?: string;
  fromName?: string;
  replyToEmail?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  diagnostics?: {
    host: string;
    port: number;
    secure: boolean;
    authUsed: boolean;
    responseTime: number;
    timestamp?: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class SmtpSettingsService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = '/api/email';

  getConfig(): Observable<SmtpConfigResponse> {
    return this.http.get<SmtpConfigResponse>(`${this.apiBase}/config`);
  }

  updateConfig(config: SmtpConfigDto): Observable<SmtpConfigResponse> {
    return this.http.post<SmtpConfigResponse>(`${this.apiBase}/config`, config);
  }

  sendTestEmail(to: string): Observable<SendEmailResult> {
    return this.http.post<SendEmailResult>(`${this.apiBase}/test`, { to });
  }

  deleteConfig(): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/config`);
  }
}
