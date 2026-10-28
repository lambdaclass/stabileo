import { API_URL, request } from './client';
import type { Account, Consents, LoginInput, Session } from './auth';

export interface AdminAccount extends Account {
  is_active: boolean;
  last_sign_in_at: string | null;
  last_active_at?: string | null;
  active_sessions: number;
  is_admin: boolean;
  consents?: Consents;
  project_count?: number;
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
  usage_telemetry_enabled?: boolean;
  cloud_projects_enabled?: boolean;
  save_requires_account?: boolean;
  cloud_projects_limit?: number;
  terms_version?: string;
}

export type AdminFlag = 'user_login_enabled' | 'usage_telemetry_enabled' | 'cloud_projects_enabled' | 'save_requires_account';
export type AdminSettingsUpdate = Partial<Record<AdminFlag, boolean>> & { cloud_projects_limit?: number };

export interface Count { label: string; count: number }
export interface Daily { day: string; count: number }

export type UsageBreakdown =
  | 'tools' | 'diagrams' | 'advanced' | 'examples' | 'exports' | 'step_methods' | 'gate_actions'
  | 'solve_outcomes' | 'solve_dims' | 'modes' | 'versions' | 'locales';

export interface InsightsSummary {
  days: number;
  since: string;
  visitors: {
    visits: number;
    browsers: number;
    visits_with_solve: number;
    solves: number;
    daily: { day: string; visits: number; solving: number }[];
  };
  usage: Record<UsageBreakdown, Count[]>;
  gate: { asked: number; passed: number };
  accounts: { total: number; new: number; active_7d: number; sign_ups: Daily[]; consents: { usage_analytics: number; model_research: number } };
  projects: { total: number; accounts: number; by_mode: Count[]; limit: number };
  feedback: { new: number };
}

export interface AdminProject {
  id: string;
  name: string;
  app_mode: 'basic' | 'pro';
  content_bytes: number;
  node_count: number | null;
  element_count: number | null;
  app_version: string | null;
  inserted_at: string;
  updated_at: string;
  owner: { id: string; email: string; name: string };
  research_consent: boolean;
}

export type FeedbackStatus = 'new' | 'read' | 'done';

export interface AdminFeedback {
  id: string;
  kind: 'bug' | 'idea' | 'question' | 'other';
  message: string;
  contact_email: string | null;
  page: string | null;
  app_version: string | null;
  user_agent: string | null;
  model_link: string | null;
  status: FeedbackStatus;
  account: { id: string; email: string; name: string } | null;
  inserted_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  admin: { id: string; email: string } | null;
  inserted_at: string;
}

export interface Page<T> {
  data: T[];
  meta: ListMeta;
}

export type ListParams = Record<string, string | number | undefined>;

export function listQuery(params: ListParams = {}): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text !== '') qs.set(key, text);
  }
  const out = qs.toString();
  return out ? `?${out}` : '';
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

  async updateSettings(settings: AdminSettingsUpdate): Promise<AdminSettings> {
    return (await request<{ data: AdminSettings }>('PUT', `${ADMIN_BASE}/settings`, { body: settings, auth: true })).data;
  },

  async insightsSummary(days: number): Promise<InsightsSummary> {
    return (await request<{ data: InsightsSummary }>('GET', `${ADMIN_BASE}/insights/summary?days=${days}`, { auth: true })).data;
  },

  listProjects(params: ListParams = {}): Promise<Page<AdminProject>> {
    return request<Page<AdminProject>>('GET', `${ADMIN_BASE}/projects${listQuery(params)}`, { auth: true });
  },

  listFeedback(params: ListParams = {}): Promise<Page<AdminFeedback>> {
    return request<Page<AdminFeedback>>('GET', `${ADMIN_BASE}/insights/feedback${listQuery(params)}`, { auth: true });
  },

  async setFeedbackStatus(id: string, status: FeedbackStatus): Promise<AdminFeedback> {
    return (await request<{ data: AdminFeedback }>('PUT', `${ADMIN_BASE}/insights/feedback/${encodeURIComponent(id)}`, { body: { status }, auth: true })).data;
  },

  listAuditLog(params: ListParams = {}): Promise<Page<AuditEntry>> {
    return request<Page<AuditEntry>>('GET', `${ADMIN_BASE}/audit-log${listQuery(params)}`, { auth: true });
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
