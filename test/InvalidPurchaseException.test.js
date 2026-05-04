import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import InvalidPurchaseException from '../src/pairtest/lib/InvalidPurchaseException.js';

describe('InvalidPurchaseException', () => {
  it('keeps a useful error name and message', () => {
    const error = new InvalidPurchaseException('invalid request');

    assert.equal(error.name, 'InvalidPurchaseException');
    assert.equal(error.message, 'invalid request');
    assert.equal(error instanceof Error, true);
  });
});
