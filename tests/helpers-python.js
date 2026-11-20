// Runs a Python script as an independent reference implementation (csv, PyYAML). Tests that
// use it skip themselves when python3 or PyYAML is not installed.
import { spawnSync } from 'node:child_process';

export const pythonHas = (modules) => spawnSync('python3', ['-c', `import ${modules}`]).status === 0;

export function python(script, input) {
  const result = spawnSync('python3', ['-c', script], { input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`python failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
