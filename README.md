# Cinema Tickets JavaScript

Submission for the Department for Work and Pensions Java & JavaScript Software Engineer coding exercise.

- Campaign number: `451133`
- Candidate/Application number: `17145968`
- Role: Java & JavaScript Software Engineer

## Project Intent

This project implements the cinema ticket purchase domain described in the exercise brief. The core service validates ticket purchase requests, calculates the payment amount, calculates the number of seats to reserve, and calls the supplied payment and seat reservation services.

The implementation keeps the provided `TicketService.purchaseTickets(accountId, ...ticketTypeRequests)` public interface intact and leaves the supplied third-party service files unchanged.

## Business Rules

- Supported ticket types are `ADULT`, `CHILD`, and `INFANT`.
- Adult tickets cost GBP 25 and reserve one seat.
- Child tickets cost GBP 15 and reserve one seat.
- Infant tickets cost GBP 0 and do not reserve a seat.
- A purchase can contain multiple ticket requests.
- A maximum of 25 tickets can be purchased in one order.
- Child and infant tickets require at least one adult ticket in the same order.
- Account IDs must be positive integers.
- Invalid purchases throw `InvalidPurchaseException`.
- Payment and seat reservation are not attempted when validation fails.

## Implementation Overview

The main domain code lives under `src/pairtest`.

- `TicketService` coordinates validation, ticket aggregation, payment calculation, seat calculation, payment, and seat reservation.
- `TicketTypeRequest` is an immutable value object for a single ticket type and quantity.
- `InvalidPurchaseException` provides a clear domain error for invalid purchase requests.
- `ticketRules.js` centralises ticket prices, seat allocation rules, supported ticket types, and the maximum ticket count.
- The files under `src/thirdparty` are treated as external provider code and are not modified.

The service supports dependency injection for the payment and seat reservation services, while still defaulting to the supplied third-party implementations when constructed with no arguments.

## Run

Start the interactive purchase flow:

```sh
npm start
```

Example scripted purchase:

```sh
npm run purchase -- --account-id=1 --adult=2 --child=1 --infant=1
```

Show CLI help:

```sh
npm run purchase -- --help
```

## Test

Run the full automated test suite:

```sh
npm test
```

The tests cover valid purchases, payment calculations, seat calculations, invalid account IDs, invalid ticket requests, external service interaction, immutable ticket requests, domain exceptions, and CLI behaviour.
