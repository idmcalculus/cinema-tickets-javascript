import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectInteractivePurchaseOptions, runCli, runInteractiveCli } from '../src/cli.js';

function createWritableBuffer() {
  return {
    value: '',
    write(chunk) {
      this.value += chunk;
      return true;
    },
  };
}

function createPrompt(answers, questions = []) {
  return async (question) => {
    questions.push(question);

    if (answers.length === 0) {
      throw new Error('missing test prompt answer');
    }

    return answers.shift();
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

  it('collects interactive purchase options in the expected order', async () => {
    const questions = [];
    const prompt = createPrompt(['1', '2', 'yes', '3', 'no'], questions);

    const options = await collectInteractivePurchaseOptions(prompt);

    assert.deepEqual(options, {
      accountId: 1,
      counts: {
        ADULT: 2,
        CHILD: 3,
        INFANT: 0,
      },
    });
    assert.deepEqual(questions, [
      'Enter account ID: ',
      'Enter number of adult tickets: ',
      'Are you getting child tickets? (y/n): ',
      'Enter number of child tickets: ',
      'Are you getting infant tickets? (y/n): ',
    ]);
  });

  it('asks the infant ticket question after declining child tickets', async () => {
    const questions = [];
    const prompt = createPrompt(['1', '2', 'no', 'yes', '1'], questions);

    const options = await collectInteractivePurchaseOptions(prompt);

    assert.deepEqual(options.counts, {
      ADULT: 2,
      CHILD: 0,
      INFANT: 1,
    });
    assert.deepEqual(questions, [
      'Enter account ID: ',
      'Enter number of adult tickets: ',
      'Are you getting child tickets? (y/n): ',
      'Are you getting infant tickets? (y/n): ',
      'Enter number of infant tickets: ',
    ]);
  });

  it('proceeds without child tickets when zero is confirmed', async () => {
    const questions = [];
    const prompt = createPrompt(['1', '2', 'yes', '0', 'yes', 'no'], questions);

    const options = await collectInteractivePurchaseOptions(prompt);

    assert.deepEqual(options.counts, {
      ADULT: 2,
      CHILD: 0,
      INFANT: 0,
    });
    assert.deepEqual(questions, [
      'Enter account ID: ',
      'Enter number of adult tickets: ',
      'Are you getting child tickets? (y/n): ',
      'Enter number of child tickets: ',
      'No child tickets will be purchased for this order, proceed? (y/n): ',
      'Are you getting infant tickets? (y/n): ',
    ]);
  });

  it('re-prompts child tickets when zero is not confirmed', async () => {
    const questions = [];
    const prompt = createPrompt(['1', '2', 'yes', '0', 'no', '3', 'no'], questions);

    const options = await collectInteractivePurchaseOptions(prompt);

    assert.deepEqual(options.counts, {
      ADULT: 2,
      CHILD: 3,
      INFANT: 0,
    });
    assert.deepEqual(questions, [
      'Enter account ID: ',
      'Enter number of adult tickets: ',
      'Are you getting child tickets? (y/n): ',
      'Enter number of child tickets: ',
      'No child tickets will be purchased for this order, proceed? (y/n): ',
      'Enter number of child tickets: ',
      'Are you getting infant tickets? (y/n): ',
    ]);
  });

  it('proceeds without infant tickets when zero is confirmed', async () => {
    const questions = [];
    const prompt = createPrompt(['1', '2', 'no', 'yes', '0', 'yes'], questions);

    const options = await collectInteractivePurchaseOptions(prompt);

    assert.deepEqual(options.counts, {
      ADULT: 2,
      CHILD: 0,
      INFANT: 0,
    });
    assert.deepEqual(questions, [
      'Enter account ID: ',
      'Enter number of adult tickets: ',
      'Are you getting child tickets? (y/n): ',
      'Are you getting infant tickets? (y/n): ',
      'Enter number of infant tickets: ',
      'No infant tickets will be purchased for this order, proceed? (y/n): ',
    ]);
  });

  it('re-prompts infant tickets when zero is not confirmed', async () => {
    const questions = [];
    const prompt = createPrompt(['1', '2', 'no', 'yes', '0', 'no', '1'], questions);

    const options = await collectInteractivePurchaseOptions(prompt);

    assert.deepEqual(options.counts, {
      ADULT: 2,
      CHILD: 0,
      INFANT: 1,
    });
    assert.deepEqual(questions, [
      'Enter account ID: ',
      'Enter number of adult tickets: ',
      'Are you getting child tickets? (y/n): ',
      'Are you getting infant tickets? (y/n): ',
      'Enter number of infant tickets: ',
      'No infant tickets will be purchased for this order, proceed? (y/n): ',
      'Enter number of infant tickets: ',
    ]);
  });

  it('does not proceed when adult tickets are missing', async () => {
    const prompt = createPrompt(['1', '', 'yes']);

    await assert.rejects(
      () => collectInteractivePurchaseOptions(prompt),
      /Enter number of adult tickets: requires a value/,
    );
  });

  it('rejects interactive totals greater than 25 tickets', async () => {
    const prompt = createPrompt(['1', '20', 'yes', '5', 'yes', '1']);

    await assert.rejects(
      () => collectInteractivePurchaseOptions(prompt),
      /total tickets cannot exceed 25/,
    );
  });

  it('runs a valid interactive purchase and prints payment and seat values', async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const prompt = createPrompt(['1', '2', 'yes', '1', 'yes', '1']);

    const exitCode = await runInteractiveCli({ stdout, stderr }, prompt);

    assert.equal(exitCode, 0);
    assert.match(stdout.value, /Cinema ticket purchase/);
    assert.match(stdout.value, /Purchase completed/);
    assert.match(stdout.value, /Amount paid: GBP 65/);
    assert.match(stdout.value, /Seats reserved: 3/);
    assert.equal(stderr.value, '');
  });
});
