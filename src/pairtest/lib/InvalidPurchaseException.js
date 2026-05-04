/**
 * Error raised when a purchase request violates ticket business rules.
 */
export default class InvalidPurchaseException extends Error {
  /**
   * Creates an invalid purchase error.
   *
   * @param {string} message Human-readable validation failure reason.
   */
  constructor(message) {
    super(message);
    this.name = 'InvalidPurchaseException';
  }
}
