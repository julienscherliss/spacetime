import { spawnSync } from 'node:child_process';

const pipelines = {
  package: ['prepare', 'web', 'mac', 'ios', 'status'],
  distribute: ['check-release', 'upload-ios', 'push-web', 'publish-mac', 'status'],
};

// Each existing stage owns its receipt. Never save a parent process's stale copy.
export function runReleasePipeline(command, { script, cwd, execute = spawnSync, report = console.log }) {
  const stages = pipelines[command];
  if (!stages) throw new Error(`Unknown release pipeline: ${command}`);
  for (const stage of stages) {
    report(`Release ${command}: ${stage}`);
    const result = execute(process.execPath, [script, stage], { cwd, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
      throw new Error(`Release stopped at ${stage}. Fix that stage, then rerun ${command}; completed work is retained.`);
    }
  }
  if (command === 'distribute') {
    report('Uploads finished. Publish changes in Lovable, run verify-web, and confirm internal TestFlight availability in App Store Connect.');
  } else {
    report('Packages prepared. Nothing uploaded or published.');
  }
}
