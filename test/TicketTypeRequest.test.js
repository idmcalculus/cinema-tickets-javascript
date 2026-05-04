import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import TicketTypeRequest from '../src/pairtest/lib/TicketTypeRequest.js';

describe('TicketTypeRequest', () => {
  it('stores supported ticket type and quantity values', () => {
    const request = new TicketTypeRequest('ADULT', 2);

    assert.equal(request.getTicketType(), 'ADULT');
    assert.equal(request.getNoOfTickets(), 2);
  });

  it('is frozen after construction', () => {
    const request = new TicketTypeRequest('CHILD', 1);

    assert.equal(Object.isFrozen(request), true);
  });

  it('rejects unknown ticket types', () => {
    assert.throws(
      () => new TicketTypeRequest('SENIOR', 1),
      TypeError,
    );
  });

  it('rejects zero ticket quantity', () => {
    assert.throws(
      () => new TicketTypeRequest('ADULT', 0),
      TypeError,
    );
  });

  it('rejects negative ticket quantity', () => {
    assert.throws(
      () => new TicketTypeRequest('ADULT', -1),
      TypeError,
    );
  });

  it('rejects non-integer ticket quantity', () => {
    assert.throws(
      () => new TicketTypeRequest('ADULT', 1.5),
      TypeError,
    );
  });
});
