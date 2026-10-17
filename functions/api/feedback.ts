// Local shape of the Pages Functions handler, so this file type-checks (and
// can be unit-tested) without the Workers type package.
type PagesFunction<E> = (context: { request: Request; env: E }) => Promise<Response>;

interface Env {
  GITHUB_TOKEN: string;
  TURNSTILE_SECRET_KEY: string;
}

export interface FeedbackBody {
  type: string;
  description: string;
  name?: string;
  shareLink?: string;
  mode?: string;
  browser?: string;
  turnstileToken: string;
}

const ALLOWED_ORIGINS = [
  'https://dedaliano.com',
  'https://www.dedaliano.com',
  'https://dedaliano.pages.dev',
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
  const allowed = ALLOWED_ORIGINS.includes(origin) || isLocalhost;
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(status: number, data: unknown, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(request) },
  });
}

// Field limits. The issue is public, so every field is bounded and treated as
// untrusted text.
export const LIMITS = {
  description: 5000,
  name: 100,
  shareLink: 8192,
  mode: 16,
  browser: 512,
  // Whole request body, before JSON parsing.
  body: 32 * 1024,
} as const;

const SHARE_LINK_HOSTS = ['stabileo.com', 'www.stabileo.com', 'dedaliano.com', 'www.dedaliano.com', 'dedaliano.pages.dev'];

/**
 * Neutralise text before it goes into a GitHub issue: `@user` and `#123`
 * would notify people and cross-link issues, and HTML comments or tags could
 * hide content from the maintainer reading the issue. A zero-width space
 * breaks the mention without changing what the reader sees.
 */
export function neutralizeMarkdown(text: string): string {
  return text
    .replace(/@(?=[A-Za-z0-9-])/g, '@\u200b')
    .replace(/#(?=\d)/g, '#\u200b')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** One line, no markup — for fields rendered inline (name, mode, browser). */
export function inlineField(text: string, max: number): string {
  return neutralizeMarkdown(text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max));
}

/** Only links to the app itself are attached; anything else is dropped. */
export function safeShareLink(link: unknown): string | null {
  if (typeof link !== 'string' || link.length > LIMITS.shareLink) return null;
  try {
    const url = new URL(link);
    if (url.protocol !== 'https:' || !SHARE_LINK_HOSTS.includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type Validated =
  | { ok: true; body: FeedbackBody }
  | { ok: false; status: number; error: string };

export function validateFeedback(raw: unknown): Validated {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, status: 400, error: 'Solicitud invalida' };
  }
  const body = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const description = str(body.description);
  if (!description?.trim()) return { ok: false, status: 400, error: 'Descripcion requerida' };
  if (description.length > LIMITS.description) {
    return { ok: false, status: 400, error: 'Descripcion demasiado larga (max 5000 chars)' };
  }
  // The captcha is mandatory. A client that could not load Turnstile cannot
  // file an issue through this endpoint: failing open would make the captcha
  // decorative.
  const turnstileToken = str(body.turnstileToken);
  if (!turnstileToken || turnstileToken.length > 2048) {
    return { ok: false, status: 403, error: 'Verificacion requerida' };
  }
  return {
    ok: true,
    body: {
      type: str(body.type) ?? 'otro',
      description,
      name: str(body.name),
      shareLink: str(body.shareLink),
      mode: str(body.mode),
      browser: str(body.browser),
      turnstileToken,
    },
  };
}

export function buildIssue(body: FeedbackBody): { title: string; body: string; label: string } {
  const typeLabels: Record<string, string> = {
    bug: 'Bug',
    sugerencia: 'Sugerencia',
    otro: 'Otro',
  };
  const label = Object.prototype.hasOwnProperty.call(typeLabels, body.type) ? typeLabels[body.type] : 'Otro';
  const titleText = inlineField(body.description.slice(0, 80), 80);
  const title = `[${label}] ${titleText}`;

  let issueBody = `**Tipo:** ${label}\n\n`;
  if (body.name?.trim()) {
    issueBody += `**Autor:** ${inlineField(body.name, LIMITS.name)}\n\n`;
  }
  issueBody += `**Descripcion:**\n${neutralizeMarkdown(body.description)}\n\n`;
  const link = safeShareLink(body.shareLink);
  if (link) {
    issueBody += `**Enlace al modelo:**\n${link}\n\n`;
  }
  if (body.mode) {
    issueBody += `**Modo:** ${inlineField(body.mode, LIMITS.mode)}\n`;
  }
  if (body.browser) {
    issueBody += `**Navegador:** ${inlineField(body.browser, LIMITS.browser)}\n`;
  }
  issueBody += `\n---\n_Enviado desde el widget de feedback de dedaliano.com_`;
  return { title, body: issueBody, label: mapLabel(body.type) };
}

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async (context) => {
  return new Response(null, { status: 204, headers: getCorsHeaders(context.request) });
};

// POST /api/feedback
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const declared = Number(context.request.headers.get('Content-Length') ?? '0');
    if (declared > LIMITS.body) {
      return jsonResponse(413, { error: 'Solicitud demasiado grande' }, context.request);
    }
    const text = await context.request.text();
    if (text.length > LIMITS.body) {
      return jsonResponse(413, { error: 'Solicitud demasiado grande' }, context.request);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return jsonResponse(400, { error: 'Solicitud invalida' }, context.request);
    }
    const validated = validateFeedback(parsed);
    if (!validated.ok) {
      return jsonResponse(validated.status, { error: validated.error }, context.request);
    }
    const body = validated.body;

    const turnstileOk = await validateTurnstile(
      body.turnstileToken,
      context.request.headers.get('CF-Connecting-IP') || '',
      context.env.TURNSTILE_SECRET_KEY,
    );
    if (!turnstileOk) {
      return jsonResponse(403, { error: 'Verificacion fallida' }, context.request);
    }

    const issue = buildIssue(body);

    // Create GitHub issue
    const ghResponse = await fetch('https://api.github.com/repos/Batuis/dedaliano/issues', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${context.env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'dedaliano-feedback-bot',
      },
      body: JSON.stringify({
        title: issue.title,
        body: issue.body,
        labels: [issue.label],
      }),
    });

    if (!ghResponse.ok) {
      const errorText = await ghResponse.text();
      console.error('GitHub API error:', ghResponse.status, errorText.slice(0, 500));
      return jsonResponse(502, { error: 'No se pudo crear el reporte' }, context.request);
    }

    const created = (await ghResponse.json()) as { html_url: string; number: number };
    return jsonResponse(201, { success: true, issueNumber: created.number, url: created.html_url }, context.request);
  } catch (err) {
    console.error('Feedback function error:', err);
    return jsonResponse(500, { error: 'Error interno del servidor' }, context.request);
  }
};

// --- Helpers ---

async function validateTurnstile(token: string, ip: string, secretKey: string): Promise<boolean> {
  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);
  formData.append('remoteip', ip);

  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });
  if (!result.ok) return false;
  const outcome = (await result.json()) as { success: boolean };
  return outcome.success === true;
}

function mapLabel(type: string): string {
  switch (type) {
    case 'bug':
      return 'bug';
    case 'sugerencia':
      return 'enhancement';
    default:
      return 'feedback';
  }
}
