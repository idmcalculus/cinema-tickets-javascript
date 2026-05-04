import { SUPPORTED_TICKET_TYPES } from '../config/ticketRules.js';

/**
 * Immutable value object describing how many tickets of one type are requested.
 */
export default class TicketTypeRequest {
  #type;

  #noOfTickets;

  /**
   * Creates a ticket type request.
   *
   * @param {string} type Supported ticket type.
   * @param {number} noOfTickets Positive integer quantity for the ticket type.
   * @throws {TypeError} When the type is unsupported or quantity is invalid.
   */
  constructor(type, noOfTickets) {
    if (!SUPPORTED_TICKET_TYPES.includes(type)) {
      throw new TypeError(`type must be one of: ${SUPPORTED_TICKET_TYPES.join(', ')}`);
    }

    if (!Number.isInteger(noOfTickets) || noOfTickets <= 0) {
      throw new TypeError('noOfTickets must be a positive integer');
    }

    this.#type = type;
    this.#noOfTickets = noOfTickets;
    Object.freeze(this);
  }

  /**
   * Returns the requested number of tickets.
   *
   * @returns {number} Positive ticket quantity.
   */
  getNoOfTickets() {
    return this.#noOfTickets;
  }

  /**
   * Returns the requested ticket type.
   *
   * @returns {string} Supported ticket type.
   */
  getTicketType() {
    return this.#type;
  }
}
