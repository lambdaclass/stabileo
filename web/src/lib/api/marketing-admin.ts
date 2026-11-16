import { request } from './client';
const BASE = '/api/v1/admin/marketing';

export interface MarketingSettings {
  meta_pixel_id: string | null;
  gtm_container_id: string | null;
  meta_capi_access_token: boolean;
  meta_capi_test_event_code: string | null;
}

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

export type AdSummary = AcquisitionSummary & { ad: string | null };
export type AdSetSummary = AcquisitionSummary & { ad_set: string | null; ads: AdSummary[] };
export type CampaignSummary = AcquisitionSummary & { channel: string; campaign: string; ad_sets: AdSetSummary[] };

export interface Acquisition {
  period: { from: string; to: string };
  totals: AcquisitionSummary;
  channels: (AcquisitionSummary & { channel: string })[];
  triggers: (AcquisitionSummary & { trigger: string })[];
  campaigns: CampaignSummary[];
  daily: { date: string; accounts: number; by_channel: Record<string, number> }[];
}

export type PeriodQuery = { days: number } | { from: string; to: string };

function query(params: Record<string, string | number>): string {
  return `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`;
}

export const marketingAdminApi = {
  async settings(): Promise<MarketingSettings> {
    return (await request<{ data: MarketingSettings }>('GET', `${BASE}/settings`, { auth: true })).data;
  },
  async acquisition(period: PeriodQuery): Promise<Acquisition> {
    return (await request<{ data: Acquisition }>('GET', `${BASE}/acquisition${query(period)}`, { auth: true })).data;
  },
};
