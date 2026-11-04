import { API_URL, request } from './client';
import type { Account, LoginInput, Session } from './auth';

export interface AdminAccount extends Account {
  is_active: boolean;
  last_sign_in_at: string | null;
  active_sessions: number;
  is_admin: boolean;
}

export type AdminSession = Session;

export type SortBy = 'inserted_at' | 'last_sign_in_at' | 'email' | 'name';
export type SortDir = 'asc' | 'desc';
export type StatusFilter = 'all' | 'active' | 'disabled';

export interface ListUsersParams {
  limit?: number;
  offset?: number;
  sort_by?: SortBy;
  sort_dir?: SortDir;
  status?: StatusFilter;
  search?: string;
}

export type AllowedEmailSortBy = 'email' | 'inserted_at';

export interface ListAllowedEmailsParams {
  limit?: number;
  offset?: number;
  sort_by?: AllowedEmailSortBy;
  sort_dir?: SortDir;
  status?: StatusFilter;
  search?: string;
}

export interface AdminAuthConfig {
  password_login: boolean;
  google_login: boolean;
}

export interface AdminSettings {
  user_login_enabled: boolean;
}

export interface AllowedEmail {
  id: string;
  email: string;
  is_active: boolean;
  added_by: { id: string; email: string } | null;
  inserted_at: string;
  updated_at: string;
}

export interface AllowedEmailPage {
  data: AllowedEmail[];
  meta: ListMeta;
}

export interface ListMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface UserPage {
  data: AdminAccount[];
  meta: ListMeta;
}

export interface ForceLogoutResult {
  data: AdminAccount;
  revoked: number;
}

export const ADMIN_BASE = '/api/v1/admin';

const PARAM_ORDER: (keyof ListUsersParams)[] = ['search', 'status', 'sort_by', 'sort_dir', 'limit', 'offset'];

export function usersQueryString(params: ListUsersParams | ListAllowedEmailsParams = {}): string {
  const qs = new URLSearchParams();
  for (const key of PARAM_ORDER) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    const text = typeof value === 'string' ? value.trim() : String(value);
    if (text === '') continue;
    qs.set(key, text);
  }
  const out = qs.toString();
  return out ? `?${out}` : '';
}

function allowedEmailPath(id: string): string {
  return `${ADMIN_BASE}/allowed-emails/${encodeURIComponent(id)}`;
}

export function googleSignInUrl(): string {
  return `${API_URL}${ADMIN_BASE}/auth/google`;
}

function userPath(id: string, action?: string): string {
  return `${ADMIN_BASE}/users/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;
}

export const adminApi = {
  authConfig(): Promise<AdminAuthConfig> {
    return request<AdminAuthConfig>('GET', `${ADMIN_BASE}/auth/config`);
  },

  exchangeOAuthCode(code: string): Promise<AdminSession> {
    return request<AdminSession>('POST', `${ADMIN_BASE}/auth/oauth/exchange`, { body: { code } });
  },

  login(input: LoginInput): Promise<AdminSession> {
    return request<AdminSession>('POST', `${ADMIN_BASE}/auth/login`, { body: input });
  },

  refresh(refreshToken: string): Promise<AdminSession> {
    return request<AdminSession>('POST', `${ADMIN_BASE}/auth/refresh`, { body: { refresh_token: refreshToken } });
  },

  async logout(refreshToken: string): Promise<void> {
    await request<unknown>('DELETE', `${ADMIN_BASE}/auth/logout`, { body: { refresh_token: refreshToken } });
  },

  async me(): Promise<Account> {
    return (await request<{ data: Account }>('GET', `${ADMIN_BASE}/auth/me`, { auth: true })).data;
  },

  listUsers(params: ListUsersParams = {}, signal?: AbortSignal): Promise<UserPage> {
    return request<UserPage>('GET', `${ADMIN_BASE}/users${usersQueryString(params)}`, { auth: true, signal });
  },

  async getUser(id: string): Promise<AdminAccount> {
    return (await request<{ data: AdminAccount }>('GET', userPath(id), { auth: true })).data;
  },

  async disableUser(id: string): Promise<AdminAccount> {
    return (await request<{ data: AdminAccount }>('POST', userPath(id, 'disable'), { auth: true })).data;
  },

  async enableUser(id: string): Promise<AdminAccount> {
    return (await request<{ data: AdminAccount }>('POST', userPath(id, 'enable'), { auth: true })).data;
  },

  forceLogout(id: string): Promise<ForceLogoutResult> {
    return request<ForceLogoutResult>('POST', userPath(id, 'force-logout'), { auth: true });
  },

  async getSettings(): Promise<AdminSettings> {
    return (await request<{ data: AdminSettings }>('GET', `${ADMIN_BASE}/settings`, { auth: true })).data;
  },

  async updateSettings(settings: AdminSettings): Promise<AdminSettings> {
    return (await request<{ data: AdminSettings }>('PUT', `${ADMIN_BASE}/settings`, { body: settings, auth: true })).data;
  },

  listAllowedEmails(params: ListAllowedEmailsParams = {}): Promise<AllowedEmailPage> {
    return request<AllowedEmailPage>('GET', `${ADMIN_BASE}/allowed-emails${usersQueryString(params)}`, { auth: true });
  },

  async addAllowedEmail(email: string): Promise<AllowedEmail> {
    return (await request<{ data: AllowedEmail }>('POST', `${ADMIN_BASE}/allowed-emails`, { body: { email }, auth: true })).data;
  },

  async removeAllowedEmail(id: string): Promise<AllowedEmail> {
    return (await request<{ data: AllowedEmail }>('DELETE', allowedEmailPath(id), { auth: true })).data;
  },
};
