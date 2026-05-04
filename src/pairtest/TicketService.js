import TicketTypeRequest from './lib/TicketTypeRequest.js';
import InvalidPurchaseException from './lib/InvalidPurchaseException.js';
import TicketPaymentService from '../thirdparty/paymentgateway/TicketPaymentService.js';
import SeatReservationService from '../thirdparty/seatbooking/SeatReservationService.js';
import {
  MAX_TICKETS_PER_PURCHASE,
  TICKET_CONFIG,
  TICKET_TYPES,
  isSupportedTicketType,
} from './config/ticketRules.js';

/**
 * Coordinates validation, payment, and seat reservation for ticket purchases.
 */
export default class TicketService {
  #paymentService;

  #seatReservationService;

  /**
   * Creates a ticket service.
   *
   * @param {TicketPaymentService} [paymentService] Payment provider adapter.
   * @param {SeatReservationService} [seatReservationService] Seat reservation provider adapter.
   */
  constructor(paymentService, seatReservationService) {
    this.#paymentService = paymentService ?? new TicketPaymentService();
    this.#seatReservationService = seatReservationService ?? new SeatReservationService();
  }

  /**
   * Purchases one or more ticket requests for a valid account.
   *
   * @param {number} accountId Positive integer account identifier.
   * @param {...TicketTypeRequest} ticketTypeRequests Ticket type requests to purchase.
   * @throws {InvalidPurchaseException} When the purchase violates validation or business rules.
   * @returns {void}
   */
  purchaseTickets(accountId, ...ticketTypeRequests) {
    this.#validateAccountId(accountId);
    this.#validateTicketRequests(ticketTypeRequests);

    const aggregated = this.#aggregateTickets(ticketTypeRequests);
    this.#validateBusinessRules(aggregated);

    const totalAmount = this.#calculateTotalAmount(aggregated);
    const totalSeats = this.#calculateTotalSeats(aggregated);

    this.#paymentService.makePayment(accountId, totalAmount);
    this.#seatReservationService.reserveSeat(accountId, totalSeats);
  }

  /**
   * Validates that the account identifier is usable for purchase.
   *
   * @param {number} accountId Candidate account identifier.
   * @throws {InvalidPurchaseException} When the account identifier is invalid.
   * @returns {void}
   */
  #validateAccountId(accountId) {
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new InvalidPurchaseException('accountId must be a positive integer');
    }
  }

  /**
   * Validates the shape and domain values of ticket requests.
   *
   * @param {TicketTypeRequest[]} requests Ticket requests supplied to the public API.
   * @throws {InvalidPurchaseException} When any request is malformed or unsupported.
   * @returns {void}
   */
  #validateTicketRequests(requests) {
    if (requests.length === 0) {
      throw new InvalidPurchaseException('at least one ticket request is required');
    }

    for (const request of requests) {
      if (!(request instanceof TicketTypeRequest)) {
        throw new InvalidPurchaseException('all ticket requests must be TicketTypeRequest instances');
      }

      const ticketType = request.getTicketType();
      if (!isSupportedTicketType(ticketType)) {
        throw new InvalidPurchaseException(`unsupported ticket type: ${ticketType}`);
      }

      const noOfTickets = request.getNoOfTickets();
      if (!Number.isInteger(noOfTickets) || noOfTickets <= 0) {
        throw new InvalidPurchaseException('number of tickets must be a positive integer');
      }
    }
  }

  /**
   * Aggregates ticket quantities by configured ticket type.
   *
   * @param {TicketTypeRequest[]} requests Validated ticket requests.
   * @returns {Map<string, number>} Ticket counts keyed by ticket type.
   */
  #aggregateTickets(requests) {
    const counts = new Map();

    for (const type of Object.keys(TICKET_CONFIG)) {
      counts.set(type, 0);
    }

    for (const request of requests) {
      const type = request.getTicketType();
      counts.set(type, counts.get(type) + request.getNoOfTickets());
    }

    return counts;
  }

  /**
   * Applies cross-ticket purchase rules.
   *
   * @param {Map<string, number>} aggregated Ticket counts keyed by ticket type.
   * @throws {InvalidPurchaseException} When total limits or adult requirements fail.
   * @returns {void}
   */
  #validateBusinessRules(aggregated) {
    const totalTickets = this.#totalTicketCount(aggregated);

    if (totalTickets > MAX_TICKETS_PER_PURCHASE) {
      throw new InvalidPurchaseException(`total tickets cannot exceed ${MAX_TICKETS_PER_PURCHASE}`);
    }

    const adultCount = aggregated.get(TICKET_TYPES.ADULT) ?? 0;
    const hasAdultRequiredTickets = [...aggregated].some(
      ([ticketType, count]) => count > 0 && TICKET_CONFIG[ticketType].requiresAdult,
    );

    if (adultCount === 0 && hasAdultRequiredTickets) {
      throw new InvalidPurchaseException('child and infant tickets require at least one adult ticket');
    }
  }

  /**
   * Calculates the amount to charge for the aggregated ticket request.
   *
   * @param {Map<string, number>} aggregated Ticket counts keyed by ticket type.
   * @returns {number} Total amount in whole GBP.
   */
  #calculateTotalAmount(aggregated) {
    let total = 0;
    for (const [type, count] of aggregated) {
      total += count * TICKET_CONFIG[type].price;
    }
    return total;
  }

  /**
   * Calculates how many seats should be reserved.
   *
   * @param {Map<string, number>} aggregated Ticket counts keyed by ticket type.
   * @returns {number} Number of seats to allocate.
   */
  #calculateTotalSeats(aggregated) {
    let total = 0;
    for (const [type, count] of aggregated) {
      total += count * TICKET_CONFIG[type].seats;
    }
    return total;
  }

  /**
   * Calculates the total number of tickets requested.
   *
   * @param {Map<string, number>} aggregated Ticket counts keyed by ticket type.
   * @returns {number} Total ticket count.
   */
  #totalTicketCount(aggregated) {
    let total = 0;
    for (const count of aggregated.values()) {
      total += count;
    }
    return total;
  }
}
