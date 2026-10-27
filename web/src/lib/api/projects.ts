import { request } from './client';

export interface CloudProject {
  id: string;
  name: string;
  app_mode: 'basic' | 'pro';
  content_bytes: number;
  node_count: number | null;
  element_count: number | null;
  app_version: string | null;
  inserted_at: string;
  updated_at: string;
}

export interface CloudProjectList {
  data: CloudProject[];
  meta: { total: number; limit: number; offset: number; max_projects: number; max_bytes: number };
}

export interface CloudProjectInput {
  name: string;
  app_mode: 'basic' | 'pro';
  content: string;
  node_count?: number;
  element_count?: number;
  app_version?: string;
}

const BASE = '/api/v1/projects';

export const projectsApi = {
  list(params: { search?: string; offset?: number } = {}): Promise<CloudProjectList> {
    const q = new URLSearchParams({ limit: '100', sort_by: 'updated_at', sort_dir: 'desc' });
    if (params.search) q.set('search', params.search);
    if (params.offset) q.set('offset', String(params.offset));
    return request<CloudProjectList>('GET', `${BASE}?${q}`, { auth: true });
  },

  async get(id: string): Promise<CloudProject & { content: string }> {
    return (await request<{ data: CloudProject & { content: string } }>('GET', `${BASE}/${id}`, { auth: true })).data;
  },

  async create(input: CloudProjectInput): Promise<CloudProject> {
    return (await request<{ data: CloudProject }>('POST', BASE, { body: input, auth: true })).data;
  },

  async update(id: string, patch: Partial<CloudProjectInput>): Promise<CloudProject> {
    return (await request<{ data: CloudProject }>('PUT', `${BASE}/${id}`, { body: patch, auth: true })).data;
  },

  async remove(id: string): Promise<void> {
    await request<unknown>('DELETE', `${BASE}/${id}`, { auth: true });
  },
};
