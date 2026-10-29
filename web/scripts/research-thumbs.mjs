import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

console.log('Gallery thumbnails are generated with the full preview set: npm run research:previews');
const result = spawnSync('npx', ['tsx', 'scripts/research-previews.ts'], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
