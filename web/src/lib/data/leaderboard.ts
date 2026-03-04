// Leaderboard de colaboradores — Top 10 contribuyentes de feedback
//
// Se actualiza manualmente al resolver issues de feedback.
// Flujo: revisar issues → identificar nombre del autor (campo "Autor" en el issue body)
//        → actualizar este array → deploy.

export interface LeaderboardEntry {
  rank: number;
  name: string;
  feedbacks: number;
  badge: string;
}

export const LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, name: 'Benja', feedbacks: 2, badge: '🏆' },
];

export const LAST_UPDATED = '2026-02-24';

/** Returns the appropriate badge for a rank position */
export function badgeForRank(rank: number): string {
  if (rank === 1) return '🏆';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '⭐';
}
