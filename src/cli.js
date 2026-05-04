#!/usr/bin/env node

import path from 'node:path';
import readline from 'node:readline';
import { stdin, stdout as processStdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import TicketService from './pairtest/TicketService.js';
import TicketTypeRequest from './pairtest/lib/TicketTypeRequest.js';
import InvalidPurchaseException from './pairtest/lib/InvalidPurchaseException.js';
import TicketPaymentService from './thirdparty/paymentgateway/TicketPaymentService.js';
import SeatReservationService from './thirdparty/seatbooking/SeatReservationService.js';
import { MAX_TICKETS_PER_PURCHASE, TICKET_TYPES } from './pairtest/config/ticketRules.js';

const USAGE = `Usage:
  npm start
  npm run purchase -- --account-id=1 --adult=2 --child=1 --infant=1

Options:
  npm start launches an interactive purchase flow.
  --account-id, --account  Positive integer account ID.
  --adult                  Number of adult tickets.
  --child                  Number of child tickets.
  --infant                 Number of infant tickets.
  --help, -h               Show this help message.`;

const OPTION_TO_TICKET_TYPE = Object.freeze({
  adult: TICKET_TYPES.ADULT,
  child: TICKET_TYPES.CHILD,
  infant: TICKET_TYPES.INFANT,
});

/**
 * Payment adapter that records the values sent through TicketService.
 */
class RecordingPaymentService extends TicketPaymentService {
  #lastPayment = null;

  /**
   * Delegates payment and stores the payment request.
   *
   * @param {number} accountId Account to charge.
   * @param {number} totalAmountToPay Amount in whole GBP.
   * @returns {void}
   */
  makePayment(accountId, totalAmountToPay) {
    super.makePayment(accountId, totalAmountToPay);
    this.#lastPayment = { accountId, totalAmountToPay };
  }

  /**
   * Last payment request made by the service.
   *
   * @returns {{accountId: number, totalAmountToPay: number} | null} Last payment request.
   */
  getLastPayment() {
    return this.#lastPayment;
  }
}

/**
 * Seat reservation adapter that records the values sent through TicketService.
 */
class RecordingSeatReservationService extends SeatReservationService {
  #lastReservation = null;

  /**
   * Delegates reservation and stores the reservation request.
   *
   * @param {number} accountId Account to reserve seats for.
   * @param {number} totalSeatsToAllocate Number of seats to reserve.
   * @returns {void}
   */
  reserveSeat(accountId, totalSeatsToAllocate) {
    super.reserveSeat(accountId, totalSeatsToAllocate);
    this.#lastReservation = { accountId, totalSeatsToAllocate };
  }

  /**
   * Last seat reservation request made by the service.
   *
   * @returns {{accountId: number, totalSeatsToAllocate: number} | null} Last reservation request.
   */
  getLastReservation() {
    return this.#lastReservation;
  }
}

/**
 * Parses CLI arguments into account and ticket counts.
 *
 * @param {string[]} args Raw command-line arguments.
 * @returns {{help: boolean, accountId: number | undefined, counts: Record<string, number>}} Parsed options.
 */
export function parseCliArgs(args) {
  const parsed = {
    help: false,
    accountId: undefined,
    counts: {
      [TICKET_TYPES.ADULT]: 0,
      [TICKET_TYPES.CHILD]: 0,
      [TICKET_TYPES.INFANT]: 0,
    },
  };

  for (let index = 0; index < args.length; index += 1) {
    const rawOption = args[index];

    if (rawOption === '--help' || rawOption === '-h') {
      parsed.help = true;
      continue;
    }

    if (!rawOption.startsWith('--')) {
      throw new Error(`unknown argument: ${rawOption}`);
    }

    const { name, value, consumedNextArg } = readOptionValue(rawOption, args[index + 1]);
    if (consumedNextArg) {
      index += 1;
    }

    if (name === 'account-id' || name === 'account') {
      parsed.accountId = parsePositiveInteger(value, `--${name}`);
      continue;
    }

    if (Object.hasOwn(OPTION_TO_TICKET_TYPE, name)) {
      const ticketType = OPTION_TO_TICKET_TYPE[name];
      parsed.counts[ticketType] = parseNonNegativeInteger(value, `--${name}`);
      continue;
    }

    throw new Error(`unknown option: --${name}`);
  }

  return parsed;
}

/**
 * Converts parsed counts into TicketTypeRequest value objects.
 *
 * @param {Record<string, number>} counts Parsed ticket counts keyed by ticket type.
 * @returns {TicketTypeRequest[]} Ticket requests with positive quantities.
 */
export function buildTicketRequests(counts) {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([ticketType, count]) => new TicketTypeRequest(ticketType, count));
}

/**
 * Collects purchase options by prompting the user step-by-step.
 *
 * @param {(question: string) => Promise<string>} prompt Question function.
 * @returns {Promise<{accountId: number, counts: Record<string, number>}>} Interactive purchase options.
 */
export async function collectInteractivePurchaseOptions(prompt) {
  const accountId = await askPositiveInteger(prompt, 'Enter account ID: ');
  const counts = {
    [TICKET_TYPES.ADULT]: await askPositiveInteger(prompt, 'Enter number of adult tickets: '),
    [TICKET_TYPES.CHILD]: 0,
    [TICKET_TYPES.INFANT]: 0,
  };
  validateTotalTicketCount(counts);

  if (await askYesNo(prompt, 'Are you getting child tickets? (y/n): ')) {
    counts[TICKET_TYPES.CHILD] = await askOptionalTicketCount(prompt, 'child');
    validateTotalTicketCount(counts);
  }

  if (await askYesNo(prompt, 'Are you getting infant tickets? (y/n): ')) {
    counts[TICKET_TYPES.INFANT] = await askOptionalTicketCount(prompt, 'infant');
    validateTotalTicketCount(counts);
  }

  return { accountId, counts };
}

/**
 * Runs the ticket purchase CLI.
 *
 * @param {string[]} args Command-line arguments excluding node and script paths.
 * @param {{stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream}} [streams] Output streams.
 * @returns {number} Process-style exit code.
 */
export function runCli(args, streams = {}) {
  const stdout = streams.stdout ?? process.stdout;
  const stderr = streams.stderr ?? process.stderr;

  try {
    const options = parseCliArgs(args);

    if (options.help) {
      stdout.write(`${USAGE}\n`);
      return 0;
    }

    const paymentService = new RecordingPaymentService();
    const seatReservationService = new RecordingSeatReservationService();
    const ticketService = new TicketService(paymentService, seatReservationService);
    const ticketRequests = buildTicketRequests(options.counts);

    ticketService.purchaseTickets(options.accountId, ...ticketRequests);

    stdout.write(`${formatSuccessMessage(
      options.counts,
      paymentService.getLastPayment(),
      seatReservationService.getLastReservation(),
    )}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof InvalidPurchaseException || error instanceof Error
      ? error.message
      : 'unknown error';
    stderr.write(`Purchase failed: ${message}\n`);
    stderr.write('Run "npm run purchase -- --help" for usage.\n');
    return 1;
  }
}

/**
 * Runs the interactive ticket purchase CLI.
 *
 * @param {{stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream}} [streams] Output streams.
 * @param {(question: string) => Promise<string>} [prompt] Question function.
 * @returns {Promise<number>} Process-style exit code.
 */
export async function runInteractiveCli(streams = {}, prompt) {
  const stdout = streams.stdout ?? process.stdout;
  const stderr = streams.stderr ?? process.stderr;
  let closePrompt = () => {};

  try {
    let ask = prompt;

    if (!ask) {
      const readlinePrompt = createReadlinePrompt();
      ask = readlinePrompt.ask;
      closePrompt = readlinePrompt.close;
    }

    stdout.write('Cinema ticket purchase\n');
    const options = await collectInteractivePurchaseOptions(ask);
    const paymentService = new RecordingPaymentService();
    const seatReservationService = new RecordingSeatReservationService();
    const ticketService = new TicketService(paymentService, seatReservationService);
    const ticketRequests = buildTicketRequests(options.counts);

    ticketService.purchaseTickets(options.accountId, ...ticketRequests);

    stdout.write(`${formatSuccessMessage(
      options.counts,
      paymentService.getLastPayment(),
      seatReservationService.getLastReservation(),
    )}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof InvalidPurchaseException || error instanceof Error
      ? error.message
      : 'unknown error';
    stderr.write(`Purchase failed: ${message}\n`);
    return 1;
  } finally {
    closePrompt();
  }
}

/**
 * Creates a prompt function backed by stdin.
 *
 * @returns {{ask: (question: string) => Promise<string>, close: () => void}} Prompt controls.
 */
function createReadlinePrompt() {
  const rl = readline.createInterface({
    input: stdin,
    crlfDelay: Infinity,
  });
  const lines = rl[Symbol.asyncIterator]();

  return {
    async ask(question) {
      processStdout.write(question);
      const nextLine = await lines.next();

      if (nextLine.done) {
        throw new Error('input ended before purchase details were completed');
      }

      return nextLine.value;
    },
    close() {
      rl.close();
    },
  };
}

/**
 * Extracts an option name and value from `--name=value` or `--name value` forms.
 *
 * @param {string} rawOption Raw option argument.
 * @param {string | undefined} nextArg Next raw argument.
 * @returns {{name: string, value: string, consumedNextArg: boolean}} Parsed option value.
 */
function readOptionValue(rawOption, nextArg) {
  const [rawName, inlineValue] = rawOption.slice(2).split('=', 2);

  if (inlineValue !== undefined) {
    return { name: rawName, value: inlineValue, consumedNextArg: false };
  }

  if (nextArg === undefined || nextArg.startsWith('--')) {
    throw new Error(`--${rawName} requires a value`);
  }

  return { name: rawName, value: nextArg, consumedNextArg: true };
}

/**
 * Parses a positive integer option value.
 *
 * @param {string} value Raw option value.
 * @param {string} label Option label for error messages.
 * @returns {number} Positive integer.
 */
function parsePositiveInteger(value, label) {
  const parsed = parseInteger(value, label);
  if (parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

/**
 * Parses a non-negative integer option value.
 *
 * @param {string} value Raw option value.
 * @param {string} label Option label for error messages.
 * @returns {number} Non-negative integer.
 */
function parseNonNegativeInteger(value, label) {
  const parsed = parseInteger(value, label);
  if (parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

/**
 * Parses an integer option value.
 *
 * @param {string} value Raw option value.
 * @param {string} label Option label for error messages.
 * @returns {number} Integer value.
 */
function parseInteger(value, label) {
  if (value === '') {
    throw new Error(`${label} requires a value`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer`);
  }

  return parsed;
}

/**
 * Prompts for a positive integer value.
 *
 * @param {(question: string) => Promise<string>} prompt Question function.
 * @param {string} question Question text.
 * @returns {Promise<number>} Positive integer answer.
 */
async function askPositiveInteger(prompt, question) {
  return parsePositiveInteger((await prompt(question)).trim(), question.trim());
}

/**
 * Prompts for an optional child/infant ticket count.
 *
 * @param {(question: string) => Promise<string>} prompt Question function.
 * @param {'child' | 'infant'} ticketLabel Ticket label for prompt text.
 * @returns {Promise<number>} Positive quantity, or zero when explicitly confirmed.
 */
async function askOptionalTicketCount(prompt, ticketLabel) {
  const countQuestion = `Enter number of ${ticketLabel} tickets: `;

  while (true) {
    const count = parseNonNegativeInteger((await prompt(countQuestion)).trim(), countQuestion.trim());

    if (count > 0) {
      return count;
    }

    const proceedWithoutTickets = await askYesNo(
      prompt,
      `No ${ticketLabel} tickets will be purchased for this order, proceed? (y/n): `,
    );

    if (proceedWithoutTickets) {
      return 0;
    }
  }
}

/**
 * Prompts for a yes/no answer.
 *
 * @param {(question: string) => Promise<string>} prompt Question function.
 * @param {string} question Question text.
 * @returns {Promise<boolean>} True for yes, false for no.
 */
async function askYesNo(prompt, question) {
  const answer = (await prompt(question)).trim().toLowerCase();

  if (answer === 'y' || answer === 'yes') {
    return true;
  }

  if (answer === 'n' || answer === 'no') {
    return false;
  }

  throw new Error(`${question.trim()} must be answered with yes or no`);
}

/**
 * Validates the total ticket count collected from the interactive flow.
 *
 * @param {Record<string, number>} counts Ticket counts keyed by ticket type.
 * @throws {Error} When the total ticket count exceeds the purchase limit.
 * @returns {void}
 */
function validateTotalTicketCount(counts) {
  const totalTickets = Object.values(counts).reduce((total, count) => total + count, 0);

  if (totalTickets > MAX_TICKETS_PER_PURCHASE) {
    throw new Error(`total tickets cannot exceed ${MAX_TICKETS_PER_PURCHASE}`);
  }
}

/**
 * Formats a successful purchase summary.
 *
 * @param {Record<string, number>} counts Ticket counts keyed by type.
 * @param {{accountId: number, totalAmountToPay: number} | null} payment Last payment request.
 * @param {{accountId: number, totalSeatsToAllocate: number} | null} reservation Last seat request.
 * @returns {string} Human-readable purchase summary.
 */
function formatSuccessMessage(counts, payment, reservation) {
  return [
    'Purchase completed',
    `Account ID: ${payment.accountId}`,
    `Tickets: ${formatTicketCounts(counts)}`,
    `Amount paid: GBP ${payment.totalAmountToPay}`,
    `Seats reserved: ${reservation.totalSeatsToAllocate}`,
  ].join('\n');
}

/**
 * Formats non-zero ticket counts for CLI output.
 *
 * @param {Record<string, number>} counts Ticket counts keyed by type.
 * @returns {string} Comma-separated ticket count summary.
 */
function formatTicketCounts(counts) {
  const entries = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([ticketType, count]) => `${ticketType} x ${count}`);

  return entries.length > 0 ? entries.join(', ') : 'none';
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  const args = process.argv.slice(2);
  process.exitCode = args.length === 0
    ? await runInteractiveCli()
    : runCli(args);
}
