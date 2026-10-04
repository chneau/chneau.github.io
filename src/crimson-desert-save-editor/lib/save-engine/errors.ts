/**
 * `describeError` now lives in `shared/save/errors.ts`, because the shared
 * round-trip proof and compression path needed the same wording. Re-exported
 * here so the Crimson engine's own modules keep importing it from './errors'.
 */
export { describeError } from "../../../shared/save/errors";
