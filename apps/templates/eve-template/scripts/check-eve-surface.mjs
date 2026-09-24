import { execFileSync } from 'node:child_process';

try {
  execFileSync(process.execPath, ['scripts/sync-eve-surface.mjs'], { stdio: 'inherit' });
  execFileSync('git', ['diff', '--exit-code', '--', 'lib/eve-surface.generated.ts'], { stdio: 'inherit' });
} catch {
  console.error('eve public surface changed. Run `pnpm eve:surface`, review the diff, and update the template/matrix.');
  process.exit(1);
}
