/**
 * The design contract: what the calculation hands to design and what design hands back.
 *
 * Plain types and pure helpers. This folder imports nothing outside itself
 * (`design-contract-boundary.test.ts`), so it can be published on its own and read by a design
 * module that is not this app.
 */
export * from './status';
export * from './check-row';
export * from './outcome';
export * from './bundle';
export * from './decisions';
export * from './reinforcement';
export * from './beam-line';
