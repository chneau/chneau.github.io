/**
 * The player's money (crowns).
 *
 * Money is **not** a named token: it is the quantity of the "crowns" item in the
 * player's native inventory, stored in the entity blob the token walk cannot
 * tokenise. Each item is a record
 *
 *     [12-byte identity] 72 00 74 00 [u16 quantity] f32(-1.0) [u16 slot]
 *
 * where the identity is per-build (a fixed item id). For build `52586` the
 * crowns identity is `06 94 4f 0f`: measured against a save whose owner reported
 * 2996 crowns, the single matching record held 2996, and the same identity holds
 * 4746 in that owner's older saves. So the quantity of that identity is the
 * wallet.
 *
 * The identity is **per game build** (a different build does not even use the
 * same `72 00 74 00` record shape), so it is a parameter and the default is the
 * one Next-Gen `52586` identity measured above.
 *
 * ## Why the scan lives in `./write`
 *
 * `locateMoney` there is this same search, and it answers a strictly larger
 * question: the record's quantity is the `u16` right after `72 00 74 00`, the
 * identity sits within the 16 bytes before it, and the scan is anchored on the
 * record *shape* (`72 00 74 00` then `f32 -1.0`) so a stray copy of the identity
 * elsewhere cannot be mistaken for the wallet. `locateMoney` returns the byte
 * offset of that quantity as well as its value, which is the difference between
 * reading the wallet and being able to write it — so a read-only twin here would
 * be the same walk over 5 MB producing strictly less.
 */

/** The crowns item identity for the Next-Gen `52586` build. */
export const CROWNS_IDENTITY_52586: readonly number[] = [
	0x06, 0x94, 0x4f, 0x0f,
];
