/**
 * @aix/foundation — FND-01 Platform Foundation shared contracts.
 * Every AIX module imports these so context, envelope, idempotency, outbox, audit,
 * time and the no-Exchange guard are uniform platform-wide.
 */
export * from "./errors.js";
export * from "./time.js";
export * from "./context.js";
export * from "./db.js";
export * from "./outbox.js";
export * from "./audit.js";
export * from "./idempotency.js";
export * from "./no-exchange.js";
export * from "./config.js";
