import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import TicketService from '../src/pairtest/TicketService.js';
import TicketTypeRequest from '../src/pairtest/lib/TicketTypeRequest.js';
import InvalidPurchaseException from '../src/pairtest/lib/InvalidPurchaseException.js';

function createMockServices() {
  const state = { paymentCalls: [], seatCalls: [] };

  const paymentService = {
    makePayment(accountId, totalAmountToPay) {
      state.paymentCalls.push({ accountId, totalAmountToPay });
    },
  };

  const seatReservationService = {
    reserveSeat(accountId, totalSeatsToAllocate) {
      state.seatCalls.push({ accountId, totalSeatsToAllocate });
    },
  };

  return { paymentService, seatReservationService, state };
}

function createService() {
  const { paymentService, seatReservationService, state } = createMockServices();
  const service = new TicketService(paymentService, seatReservationService);
  return { service, state };
}

function createAlteredTicketTypeRequest({ ticketType = 'ADULT', noOfTickets = 1 } = {}) {
  class AlteredTicketTypeRequest extends TicketTypeRequest {
    constructor() {
      super('ADULT', 1);
    }

    getTicketType() {
      return ticketType;
    }

    getNoOfTickets() {
      return noOfTickets;
    }
  }

  return new AlteredTicketTypeRequest();
}

describe('TicketService', () => {
  let service;
  let state;

  beforeEach(() => {
    const result = createService();
    service = result.service;
    state = result.state;
  });

  describe('valid purchases', () => {
    it('processes an adult-only purchase', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 2));
      assert.deepEqual(state.paymentCalls, [{ accountId: 1, totalAmountToPay: 50 }]);
      assert.deepEqual(state.seatCalls, [{ accountId: 1, totalSeatsToAllocate: 2 }]);
    });

    it('processes adult + child purchase', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 2), new TicketTypeRequest('CHILD', 3));
      assert.deepEqual(state.paymentCalls, [{ accountId: 1, totalAmountToPay: 95 }]);
      assert.deepEqual(state.seatCalls, [{ accountId: 1, totalSeatsToAllocate: 5 }]);
    });

    it('processes adult + infant purchase', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 1), new TicketTypeRequest('INFANT', 1));
      assert.deepEqual(state.paymentCalls, [{ accountId: 1, totalAmountToPay: 25 }]);
      assert.deepEqual(state.seatCalls, [{ accountId: 1, totalSeatsToAllocate: 1 }]);
    });

    it('processes adult + child + infant purchase', () => {
      service.purchaseTickets(
        1,
        new TicketTypeRequest('ADULT', 2),
        new TicketTypeRequest('CHILD', 3),
        new TicketTypeRequest('INFANT', 1),
      );
      assert.deepEqual(state.paymentCalls, [{ accountId: 1, totalAmountToPay: 95 }]);
      assert.deepEqual(state.seatCalls, [{ accountId: 1, totalSeatsToAllocate: 5 }]);
    });

    it('processes multiple requests of the same type', () => {
      service.purchaseTickets(
        1,
        new TicketTypeRequest('ADULT', 5),
        new TicketTypeRequest('ADULT', 5),
      );
      assert.deepEqual(state.paymentCalls, [{ accountId: 1, totalAmountToPay: 250 }]);
      assert.deepEqual(state.seatCalls, [{ accountId: 1, totalSeatsToAllocate: 10 }]);
    });

    it('processes maximum valid purchase of exactly 25 tickets', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 25));
      assert.deepEqual(state.paymentCalls, [{ accountId: 1, totalAmountToPay: 625 }]);
      assert.deepEqual(state.seatCalls, [{ accountId: 1, totalSeatsToAllocate: 25 }]);
    });

    it('processes exactly 25 mixed tickets', () => {
      service.purchaseTickets(
        1,
        new TicketTypeRequest('ADULT', 10),
        new TicketTypeRequest('CHILD', 10),
        new TicketTypeRequest('INFANT', 5),
      );
      assert.deepEqual(state.paymentCalls, [{ accountId: 1, totalAmountToPay: 400 }]);
      assert.deepEqual(state.seatCalls, [{ accountId: 1, totalSeatsToAllocate: 20 }]);
    });
  });

  describe('payment calculations', () => {
    it('charges £25 per adult ticket', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 3));
      assert.equal(state.paymentCalls[0].totalAmountToPay, 75);
    });

    it('charges £15 per child ticket', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 1), new TicketTypeRequest('CHILD', 2));
      assert.equal(state.paymentCalls[0].totalAmountToPay, 55);
    });

    it('charges £0 per infant ticket', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 1), new TicketTypeRequest('INFANT', 3));
      assert.equal(state.paymentCalls[0].totalAmountToPay, 25);
    });

    it('calculates mixed purchase total correctly', () => {
      service.purchaseTickets(
        1,
        new TicketTypeRequest('ADULT', 2),
        new TicketTypeRequest('CHILD', 3),
        new TicketTypeRequest('INFANT', 1),
      );
      assert.equal(state.paymentCalls[0].totalAmountToPay, 95);
    });
  });

  describe('seat calculations', () => {
    it('reserves one seat per adult ticket', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 3));
      assert.equal(state.seatCalls[0].totalSeatsToAllocate, 3);
    });

    it('reserves one seat per child ticket', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 1), new TicketTypeRequest('CHILD', 4));
      assert.equal(state.seatCalls[0].totalSeatsToAllocate, 5);
    });

    it('does not reserve seats for infant tickets', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 1), new TicketTypeRequest('INFANT', 5));
      assert.equal(state.seatCalls[0].totalSeatsToAllocate, 1);
    });
  });

  describe('invalid account ID', () => {
    it('rejects accountId = 0', () => {
      assert.throws(
        () => service.purchaseTickets(0, new TicketTypeRequest('ADULT', 1)),
        InvalidPurchaseException,
      );
    });

    it('rejects negative accountId', () => {
      assert.throws(
        () => service.purchaseTickets(-1, new TicketTypeRequest('ADULT', 1)),
        InvalidPurchaseException,
      );
    });

    it('rejects non-integer accountId (string)', () => {
      assert.throws(
        () => service.purchaseTickets('1', new TicketTypeRequest('ADULT', 1)),
        InvalidPurchaseException,
      );
    });

    it('rejects non-integer accountId (float)', () => {
      assert.throws(
        () => service.purchaseTickets(1.5, new TicketTypeRequest('ADULT', 1)),
        InvalidPurchaseException,
      );
    });

    it('rejects null accountId', () => {
      assert.throws(
        () => service.purchaseTickets(null, new TicketTypeRequest('ADULT', 1)),
        InvalidPurchaseException,
      );
    });

    it('rejects undefined accountId', () => {
      assert.throws(
        () => service.purchaseTickets(undefined, new TicketTypeRequest('ADULT', 1)),
        InvalidPurchaseException,
      );
    });
  });

  describe('invalid ticket requests', () => {
    it('rejects no ticket requests', () => {
      assert.throws(
        () => service.purchaseTickets(1),
        InvalidPurchaseException,
      );
    });

    it('rejects non-TicketTypeRequest objects', () => {
      assert.throws(
        () => service.purchaseTickets(1, { type: 'ADULT', noOfTickets: 1 }),
        InvalidPurchaseException,
      );
    });

    it('rejects a mix of valid and invalid requests', () => {
      assert.throws(
        () => service.purchaseTickets(1, new TicketTypeRequest('ADULT', 1), 'CHILD'),
        InvalidPurchaseException,
      );
    });

    it('rejects zero ticket quantity', () => {
      assert.throws(
        () => service.purchaseTickets(1, createAlteredTicketTypeRequest({ noOfTickets: 0 })),
        InvalidPurchaseException,
      );
    });

    it('rejects negative ticket quantity', () => {
      assert.throws(
        () => service.purchaseTickets(1, createAlteredTicketTypeRequest({ noOfTickets: -1 })),
        InvalidPurchaseException,
      );
    });

    it('rejects unsupported ticket types from TicketTypeRequest instances', () => {
      assert.throws(
        () => service.purchaseTickets(1, createAlteredTicketTypeRequest({ ticketType: 'SENIOR' })),
        InvalidPurchaseException,
      );
    });

    it('rejects total tickets exceeding 25', () => {
      assert.throws(
        () => service.purchaseTickets(1, new TicketTypeRequest('ADULT', 20), new TicketTypeRequest('CHILD', 6)),
        InvalidPurchaseException,
      );
    });

    it('rejects child ticket without adult', () => {
      assert.throws(
        () => service.purchaseTickets(1, new TicketTypeRequest('CHILD', 1)),
        InvalidPurchaseException,
      );
    });

    it('rejects infant ticket without adult', () => {
      assert.throws(
        () => service.purchaseTickets(1, new TicketTypeRequest('INFANT', 1)),
        InvalidPurchaseException,
      );
    });

    it('rejects child + infant without adult', () => {
      assert.throws(
        () => service.purchaseTickets(1, new TicketTypeRequest('CHILD', 1), new TicketTypeRequest('INFANT', 1)),
        InvalidPurchaseException,
      );
    });
  });

  describe('service interaction', () => {
    it('calls payment service once for valid purchases', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 2));
      assert.equal(state.paymentCalls.length, 1);
    });

    it('calls seat reservation service once for valid purchases', () => {
      service.purchaseTickets(1, new TicketTypeRequest('ADULT', 2));
      assert.equal(state.seatCalls.length, 1);
    });

    it('passes correct accountId and amount to payment service', () => {
      service.purchaseTickets(42, new TicketTypeRequest('ADULT', 3), new TicketTypeRequest('CHILD', 1));
      assert.equal(state.paymentCalls[0].accountId, 42);
      assert.equal(state.paymentCalls[0].totalAmountToPay, 90);
    });

    it('passes correct accountId and seat count to seat service', () => {
      service.purchaseTickets(42, new TicketTypeRequest('ADULT', 3), new TicketTypeRequest('CHILD', 1));
      assert.equal(state.seatCalls[0].accountId, 42);
      assert.equal(state.seatCalls[0].totalSeatsToAllocate, 4);
    });

    it('does not call payment service when validation fails', () => {
      assert.throws(() => service.purchaseTickets(0, new TicketTypeRequest('ADULT', 1)), InvalidPurchaseException);
      assert.equal(state.paymentCalls.length, 0);
    });

    it('does not call seat service when validation fails', () => {
      assert.throws(() => service.purchaseTickets(0, new TicketTypeRequest('ADULT', 1)), InvalidPurchaseException);
      assert.equal(state.seatCalls.length, 0);
    });

    it('does not call either service when ticket rules fail', () => {
      assert.throws(
        () => service.purchaseTickets(1, new TicketTypeRequest('CHILD', 1)),
        InvalidPurchaseException,
      );
      assert.equal(state.paymentCalls.length, 0);
      assert.equal(state.seatCalls.length, 0);
    });
  });

  describe('default constructor (no dependency injection)', () => {
    it('works with new TicketService() using real third-party services', () => {
      const defaultService = new TicketService();
      assert.doesNotThrow(() => defaultService.purchaseTickets(1, new TicketTypeRequest('ADULT', 1)));
    });
  });
});
