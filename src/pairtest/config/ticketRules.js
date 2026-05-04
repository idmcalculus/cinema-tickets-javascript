/**
 * Ticket type identifiers supported by the cinema ticket domain.
 *
 * @readonly
 * @enum {string}
 */
export const TICKET_TYPES = Object.freeze({
  ADULT: 'ADULT',
  CHILD: 'CHILD',
  INFANT: 'INFANT',
});

/**
 * Maximum number of tickets allowed in a single purchase.
 *
 * @type {number}
 */
export const MAX_TICKETS_PER_PURCHASE = 25;

/**
 * @typedef {object} TicketRule
 * @property {number} price Price in whole GBP.
 * @property {number} seats Number of seats reserved per ticket.
 * @property {boolean} requiresAdult Whether this ticket type requires an adult in the purchase.
 */

/**
 * Pricing and seat allocation rules keyed by ticket type.
 *
 * @type {Readonly<Record<string, Readonly<TicketRule>>>}
 */
export const TICKET_CONFIG = Object.freeze({
  [TICKET_TYPES.ADULT]: Object.freeze({ price: 25, seats: 1, requiresAdult: false }),
  [TICKET_TYPES.CHILD]: Object.freeze({ price: 15, seats: 1, requiresAdult: true }),
  [TICKET_TYPES.INFANT]: Object.freeze({ price: 0, seats: 0, requiresAdult: true }),
});

/**
 * Ordered list of supported ticket type identifiers.
 *
 * @type {readonly string[]}
 */
export const SUPPORTED_TICKET_TYPES = Object.freeze(Object.values(TICKET_TYPES));

/**
 * Checks whether a value is a supported ticket type.
 *
 * @param {unknown} ticketType Candidate ticket type.
 * @returns {boolean} True when the value maps to a configured ticket rule.
 */
export function isSupportedTicketType(ticketType) {
  return Object.hasOwn(TICKET_CONFIG, ticketType);
}
