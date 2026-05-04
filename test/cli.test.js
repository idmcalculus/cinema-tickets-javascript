import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../src/cli.js';

function createWritableBuffer() {
  return {
    value: '',
    write(chunk) {
      this.value += chunk;
      return true;
    },
  };
}

describe('CLI', () => {
  it('prints help successfully', () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = runCli(['--help'], { stdout, stderr });

    assert.equal(exitCode, 0);
    assert.match(stdout.value, /Usage:/);
    assert.equal(stderr.value, '');
  });

  it('runs a valid purchase and prints payment and seat values', () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = runCli(
      ['--account-id=1', '--adult=2', '--child=3', '--infant=1'],
      { stdout, stderr },
    );

    assert.equal(exitCode, 0);
    assert.match(stdout.value, /Purchase completed/);
    assert.match(stdout.value, /Amount paid: GBP 95/);
    assert.match(stdout.value, /Seats reserved: 5/);
    assert.equal(stderr.value, '');
  });

  it('returns an error when purchase rules are invalid', () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = runCli(['--account-id=1', '--child=1'], { stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(stdout.value, '');
    assert.match(stderr.value, /Purchase failed:/);
  });

  it('returns an error for unknown options', () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = runCli(['--account-id=1', '--senior=1'], { stdout, stderr });

    assert.equal(exitCode, 1);
    assert.equal(stdout.value, '');
    assert.match(stderr.value, /unknown option: --senior/);
  });
});
