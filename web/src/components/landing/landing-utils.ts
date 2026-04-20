export const REPO_URL = 'https://github.com/lambdaclass/stabileo';
export const DOCS_HUB_URL = `${REPO_URL}/blob/main/docs/README.md`;
export const QUICK_START_URL = `${REPO_URL}/blob/main/docs/QUICKSTART.md`;
export const AI_WORKFLOW_URL = `${REPO_URL}/blob/main/docs/AI_MODELING_WORKFLOW.md`;
export const SOLVER_REF_URL = `${REPO_URL}/blob/main/docs/SOLVER_REFERENCE.md`;

export function enterApp() {
  window.dispatchEvent(new CustomEvent('stabileo-enter-app'));
}

export function scrollToId(id: string, root?: HTMLElement | null) {
  const el = (root ?? document).querySelector(`#${CSS.escape(id)}`) as HTMLElement | null;
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const GITHUB_API = `https://api.github.com/repos/lambdaclass/stabileo`;
const CACHE_KEY = 'stabileo-gh-stars';
const CACHE_TTL = 6 * 60 * 60 * 1000;

export async function fetchGithubStars(): Promise<number | null> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { stars, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL && typeof stars === 'number') return stars;
    }
  } catch {}
  try {
    const res = await fetch(GITHUB_API);
    if (!res.ok) return null;
    const data = await res.json();
    const stars = typeof data?.stargazers_count === 'number' ? data.stargazers_count : null;
    if (stars != null) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ stars, ts: Date.now() })); } catch {}
    }
    return stars;
  } catch {
    return null;
  }
}
