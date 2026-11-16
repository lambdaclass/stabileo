import { request } from './client';

export type FeedbackKind = 'bug' | 'idea' | 'question' | 'other';

export interface FeedbackInput {
  kind: FeedbackKind;
  message: string;
  page?: string;
  app_version?: string;
  model_link?: string;
}

export const feedbackApi = {
  async send(input: FeedbackInput): Promise<{ id: string; status: string }> {
    return (await request<{ data: { id: string; status: string } }>('POST', '/api/v1/insights/feedback', { body: input, auth: true })).data;
  },
};
