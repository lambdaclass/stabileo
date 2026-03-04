interface Env {
  GITHUB_TOKEN: string;
  TURNSTILE_SECRET_KEY: string;
}

interface FeedbackBody {
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

// CORS preflight
export const onRequestOptions: PagesFunction<Env> = async (context) => {
  return new Response(null, { status: 204, headers: getCorsHeaders(context.request) });
};

// POST /api/feedback
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as FeedbackBody;

    // Validate required fields
    if (!body.description?.trim()) {
      return jsonResponse(400, { error: 'Descripcion requerida' }, context.request);
    }
    if (body.description.length > 5000) {
      return jsonResponse(400, { error: 'Descripcion demasiado larga (max 5000 chars)' }, context.request);
    }
    // Validate Turnstile token (skip if client-side Turnstile failed)
    const bypassTurnstile = !body.turnstileToken || body.turnstileToken === 'turnstile-bypass';
    if (!bypassTurnstile) {
      const turnstileOk = await validateTurnstile(
        body.turnstileToken,
        context.request.headers.get('CF-Connecting-IP') || '',
        context.env.TURNSTILE_SECRET_KEY,
      );
      if (!turnstileOk) {
        return jsonResponse(403, { error: 'Verificacion fallida' }, context.request);
      }
    }

    // Build GitHub issue
    const typeLabels: Record<string, string> = {
      bug: 'Bug',
      sugerencia: 'Sugerencia',
      otro: 'Otro',
    };
    const label = typeLabels[body.type] || 'Otro';
    const titleText = body.description.slice(0, 80).replace(/\n/g, ' ');
    const title = `[${label}] ${titleText}`;

    let issueBody = `**Tipo:** ${label}\n\n`;
    if (body.name?.trim()) {
      issueBody += `**Autor:** ${body.name.trim()}\n\n`;
    }
    issueBody += `**Descripcion:**\n${body.description}\n\n`;
    if (body.shareLink) {
      issueBody += `**Enlace al modelo:**\n${body.shareLink}\n\n`;
    }
    if (body.mode) {
      issueBody += `**Modo:** ${body.mode}\n`;
    }
    if (body.browser) {
      issueBody += `**Navegador:** ${body.browser}\n`;
    }
    issueBody += `\n---\n_Enviado desde el widget de feedback de dedaliano.com_`;

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
        title,
        body: issueBody,
        labels: [mapLabel(body.type)],
      }),
    });

    if (!ghResponse.ok) {
      const errorText = await ghResponse.text();
      console.error('GitHub API error:', ghResponse.status, errorText);
      return jsonResponse(502, { error: 'No se pudo crear el reporte' }, context.request);
    }

    const issue = (await ghResponse.json()) as { html_url: string; number: number };
    return jsonResponse(201, { success: true, issueNumber: issue.number, url: issue.html_url }, context.request);
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
  const outcome = (await result.json()) as { success: boolean };
  return outcome.success;
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
