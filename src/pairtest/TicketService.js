import TicketTypeRequest from './lib/TicketTypeRequest.js';
import InvalidPurchaseException from './lib/InvalidPurchaseException.js';
import TicketPaymentService from '../thirdparty/paymentgateway/TicketPaymentService.js';
import SeatReservationService from '../thirdparty/seatbooking/SeatReservationService.js';

const TICKET_CONFIG = Object.freeze({
  ADULT:  { price: 25, seats: 1 },
  CHILD:  { price: 15, seats: 1 },
  INFANT: { price: 0,  seats: 0 },
});

const MAX_TICKETS = 25;

export default class TicketService {
  #paymentService;
  #seatReservationService;

  constructor(paymentService, seatReservationService) {
    this.#paymentService = paymentService ?? new TicketPaymentService();
    this.#seatReservationService = seatReservationService ?? new SeatReservationService();
  }

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

  #validateAccountId(accountId) {
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new InvalidPurchaseException('accountId must be a positive integer');
    }
  }

  #validateTicketRequests(requests) {
    if (requests.length === 0) {
      throw new InvalidPurchaseException('at least one ticket request is required');
    }

    for (const request of requests) {
      if (!(request instanceof TicketTypeRequest)) {
        throw new InvalidPurchaseException('all ticket requests must be TicketTypeRequest instances');
      }

      const noOfTickets = request.getNoOfTickets();
      if (!Number.isInteger(noOfTickets) || noOfTickets <= 0) {
        throw new InvalidPurchaseException('number of tickets must be a positive integer');
      }
    }
  }

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

  #validateBusinessRules(aggregated) {
    const totalTickets = this.#totalTicketCount(aggregated);

    if (totalTickets > MAX_TICKETS) {
      throw new InvalidPurchaseException(`total tickets cannot exceed ${MAX_TICKETS}`);
    }

    const adultCount = aggregated.get('ADULT') ?? 0;
    const childCount = aggregated.get('CHILD') ?? 0;
    const infantCount = aggregated.get('INFANT') ?? 0;

    if (adultCount === 0 && (childCount > 0 || infantCount > 0)) {
      throw new InvalidPurchaseException('child and infant tickets require at least one adult ticket');
    }
  }

  #calculateTotalAmount(aggregated) {
    let total = 0;
    for (const [type, count] of aggregated) {
      total += count * TICKET_CONFIG[type].price;
    }
    return total;
  }

  #calculateTotalSeats(aggregated) {
    let total = 0;
    for (const [type, count] of aggregated) {
      total += count * TICKET_CONFIG[type].seats;
    }
    return total;
  }

  #totalTicketCount(aggregated) {
    let total = 0;
    for (const count of aggregated.values()) {
      total += count;
    }
    return total;
  }
}
