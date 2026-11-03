import { request } from './client';
const BASE = '/api/v1/admin/marketing';

export type SecretField = 'meta_capi_access_token' | 'meta_ads_access_token' | 'google_ads_service_account';
export type PlainField = 'meta_pixel_id' | 'meta_capi_test_event_code' | 'gtm_container_id' | 'meta_ad_account_id' | 'google_ads_customer_id' | 'google_ads_login_customer_id';

export type MarketingSettings = Record<PlainField, string | null> & {
  secrets: Record<SecretField, { set: boolean; hint: string | null }>;
  sync_interval_minutes: number;
};

export type MarketingUpdate = Partial<Record<PlainField | SecretField, string | null>> & { sync_interval_minutes?: number };

export interface AcquisitionSummary {
  accounts: number;
  paid: number;
  analyzed: number;
  saved: number;
  exported: number;
  return_eligible: number;
  returned: number;
  median_hours_to_save: number | null;
}

export interface Acquisition {
  period: { from: string; to: string };
  totals: AcquisitionSummary;
  channels: (AcquisitionSummary & { channel: string })[];
  triggers: (AcquisitionSummary & { trigger: string })[];
  campaigns: (AcquisitionSummary & { channel: string; campaign: string })[];
  daily: { date: string; accounts: number; by_channel: Record<string, number> }[];
}

export type Channel = 'all' | 'meta' | 'google';
export type Display = 'USD' | 'ARS';

export interface AdAccountInfo {
  id: string;
  channel: 'meta' | 'google';
  name: string | null;
  external_id: string;
  currency: string | null;
  sync_status: 'pending' | 'ok' | 'error' | 'not_connected';
  last_synced_at: string | null;
  last_sync_error: string | null;
}

export interface AdTotals {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  unique_clicks: number | null;
  signup_clicks: number | null;
  signups: number;
  activations: number | null;
  results: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cost_per_signup: number | null;
  cost_per_activation: number | null;
  signup_rate: number | null;
  budget?: number;
  budget_executed?: number | null;
  accounts?: number;
  activated?: number;
  cost_per_account?: number | null;
  cost_per_activated?: number | null;
}

export interface AdRow extends AdTotals {
  id: string;
  level: 'campaign' | 'ad_group' | 'ad';
  external_id: string;
  channel: 'meta' | 'google';
  name: string | null;
  status: string | null;
  objective: string | null;
  goal: string | null;
  daily_budget: number | null;
  result_type: string | null;
  cost_per_result: number | null;
  accounts: number;
  activated: number;
  cost_per_account: number | null;
  cost_per_activated: number | null;
  thumbnail_url: string | null;
  format: string | null;
  links: { manager: string | null; preview: string | null; instagram: string | null; facebook: string | null };
  children: AdRow[];
}

export interface GoalCost {
  spend: number;
  count: number;
  other: number;
  cost: number | null;
}

export interface AdsOverview {
  accounts: AdAccountInfo[];
  sync_interval_minutes: number;
  period: { from: string; to: string; days: number; last_data_on: string };
  display: Display;
  kpis: { current: AdTotals; previous: AdTotals; today: { daily_budget: number; active_campaigns: number } };
  daily: (AdTotals & { date: string; in_period: boolean; accounts: number; activated: number })[];
  goals: { metrics: Record<'signups' | 'activations' | 'clicks', GoalCost>; unassigned: { awareness: number; other: number } };
  tree: AdRow[];
  fx_missing: boolean;
}

export interface ConnectionStep {
  key: string;
  status: 'ok' | 'error' | 'skipped';
  detail: string | null;
}

export type ConnectionReport = AdAccountInfo & { ok: boolean; steps: ConnectionStep[] };

export type PeriodQuery = { days: number } | { from: string; to: string };

function query(params: Record<string, string | number>): string {
  return `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`;
}

export const marketingAdminApi = {
  async settings(): Promise<MarketingSettings> {
    return (await request<{ data: MarketingSettings }>('GET', `${BASE}/settings`, { auth: true })).data;
  },
  async updateSettings(update: MarketingUpdate): Promise<MarketingSettings> {
    return (await request<{ data: MarketingSettings }>('PUT', `${BASE}/settings`, { body: update, auth: true })).data;
  },
  async acquisition(period: PeriodQuery): Promise<Acquisition> {
    return (await request<{ data: Acquisition }>('GET', `${BASE}/acquisition${query(period)}`, { auth: true })).data;
  },
  async adsOverview(params: PeriodQuery & { channel: Channel; display: Display }): Promise<AdsOverview> {
    return (await request<{ data: AdsOverview }>('GET', `${BASE}/ads/overview${query(params)}`, { auth: true })).data;
  },
  async syncAds(): Promise<number> {
    return (await request<{ data: { queued: number } }>('POST', `${BASE}/ads/sync`, { auth: true })).data.queued;
  },
  async connections(): Promise<ConnectionReport[]> {
    return (await request<{ data: ConnectionReport[] }>('GET', `${BASE}/ads/connections`, { auth: true })).data;
  },
};
