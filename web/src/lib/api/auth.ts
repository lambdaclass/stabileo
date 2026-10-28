import { request } from './client';

export interface Consents {
  terms: { version: string; accepted_at: string } | null;
  terms_current: boolean;
  usage_analytics: boolean;
  model_research: boolean;
}

export type ConsentKind = 'terms' | 'usage_analytics' | 'model_research';

export interface Account {
  id: string;
  email: string;
  name: string;
  company: string | null;
  job_title: string | null;
  country: string | null;
  locale: string;
  email_verified_at: string | null;
  inserted_at: string;
  consents?: Consents;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  account: Account;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  locale?: string;
  accept_terms: boolean;
  usage_analytics?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthConfig {
  user_login_enabled: boolean;
  terms_version?: string;
  usage_telemetry_enabled?: boolean;
  cloud_projects_enabled?: boolean;
  save_requires_account?: boolean;
}

export type ProfileUpdate = Partial<{
  name: string;
  company: string | null;
  job_title: string | null;
  country: string | null;
  locale: string;
}>;

const BASE = '/api/v1/auth';

export const authApi = {
  config(): Promise<AuthConfig> {
    return request<AuthConfig>('GET', `${BASE}/config`);
  },

  register(input: RegisterInput): Promise<Session> {
    return request<Session>('POST', `${BASE}/register`, { body: input });
  },

  login(input: LoginInput): Promise<Session> {
    return request<Session>('POST', `${BASE}/login`, { body: input });
  },

  refresh(refreshToken: string): Promise<Session> {
    return request<Session>('POST', `${BASE}/refresh`, { body: { refresh_token: refreshToken } });
  },

  async logout(refreshToken: string): Promise<void> {
    await request<unknown>('DELETE', `${BASE}/logout`, { body: { refresh_token: refreshToken } });
  },

  async me(): Promise<Account> {
    return (await request<{ data: Account }>('GET', `${BASE}/me`, { auth: true })).data;
  },

  async updateMe(patch: ProfileUpdate): Promise<Account> {
    return (await request<{ data: Account }>('PUT', `${BASE}/me`, { body: patch, auth: true })).data;
  },

  async recordConsent(kind: ConsentKind, granted: boolean): Promise<Account> {
    return (await request<{ data: Account }>('POST', `${BASE}/consents`, { body: { kind, granted }, auth: true })).data;
  },

  async changePassword(currentPassword: string, password: string): Promise<void> {
    await request<unknown>('PUT', `${BASE}/password`, {
      body: { current_password: currentPassword, password },
      auth: true,
    });
  },
};
