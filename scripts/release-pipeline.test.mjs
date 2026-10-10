import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReleasePipeline } from './release-pipeline.mjs';

function run(command, failAt) {
  const calls = [];
  const invoke = () => runReleasePipeline(command, {
    script: '/sample/release.mjs', cwd: '/sample', report: () => {},
    execute: (tool, args, options) => {
      assert.equal(tool, process.execPath);
      assert.equal(args[0], '/sample/release.mjs');
      assert.equal(options.cwd, '/sample');
      assert.equal(options.stdio, 'inherit');
      calls.push(args[1]);
      return { status: args[1] === failAt ? 1 : 0 };
    },
  });
  return { calls, invoke };
}

test('packaging cannot invoke an upload or publication stage', () => {
  const probe = run('package');
  probe.invoke();
  assert.deepEqual(probe.calls, ['prepare', 'web', 'mac', 'ios', 'status']);
});
test('failed package stops before subsequent stages', () => {
  const probe = run('package', 'mac');
  assert.throws(probe.invoke, /stopped at mac/);
  assert.deepEqual(probe.calls, ['prepare', 'web', 'mac']);
});
test('distribution checks readiness before any external write', () => {
  const probe = run('distribute', 'check-release');
  assert.throws(probe.invoke, /stopped at check-release/);
  assert.deepEqual(probe.calls, ['check-release']);
});
test('failed upload stops website and Mac publication', () => {
  const probe = run('distribute', 'upload-ios');
  assert.throws(probe.invoke, /stopped at upload-ios/);
  assert.deepEqual(probe.calls, ['check-release', 'upload-ios']);
});
test('successful distribution runs all stages in order', () => {
  const probe = run('distribute');
  probe.invoke();
  assert.deepEqual(probe.calls, ['check-release', 'upload-ios', 'push-web', 'publish-mac', 'status']);
});
test('unknown pipeline cannot start any stage', () => {
  const probe = run('unapproved');
  assert.throws(probe.invoke, /Unknown release pipeline/);
  assert.deepEqual(probe.calls, []);
});
