/**
 * The player entity and its position.
 *
 * The save has a `BS Player` object with a `Vector position`, a `rotation`, and
 * a `template` naming the entity, e.g.
 * `gameplay\templates\characters\player\player.w2ent`. A `Vector` value is
 * packed as `00 | u32 tag | f32 x | u32 tag | f32 y | u32 tag | f32 z | u32 tag |
 * f32 w | 0000` with the floats little-endian and `w` = 1.0, so the first three
 * floats are the world position.
 */

import { readNameTable } from "./names";
import { parseTokens, type Token } from "./tokens";

type Player = {
	readonly id: string;
	readonly template: string;
	readonly x: number;
	readonly y: number;
	readonly z: number;
};

/**
 * A `Vector` value rendered as hex: one leading `00`, then four
 * `(u32 tag, f32)` pairs (32 bytes), then `0000`.
 *
 * The length is fixed, and the guard below checks it exactly rather than
 * approximately. The source decoder accepted any `position` of 42 hex characters
 * or more and then read a fourth component out of it, which throws a bare
 * `RangeError` from `DataView` on anything between 42 and 49 characters — a
 * crash on a value that was merely not a position. 70 characters is what a
 * `Vector` is, and a `position` that is not 70 characters is not one.
 */
const VECTOR_HEX_LENGTH = 70;

/** Decode the `[x, y, z]` of a `Vector` value from its hex byte text. */
const decodeVector = (hex: string): [number, number, number] => {
	const parts = hex.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? [];
	// Skip the single leading 0x00, then 4 × (4-byte tag + 4-byte f32).
	const floatAt = (i: number): number => {
		const b = parts.slice(1 + i * 8 + 4, 1 + i * 8 + 8);
		return new DataView(new Uint8Array(b).buffer).getFloat32(0, true);
	};
	return [floatAt(0), floatAt(1), floatAt(2)];
};

/** The player entity, preferring the one whose template names the player. */
export const readPlayer = (
	data: Uint8Array,
	scan?: readonly Token[],
): Player | undefined => {
	// `scan` lets a caller that has already walked the stream hand its token list
	// in; rebuilding it here measured at ~240 ms on the 5 MB fixture and ~750 ms on
	// a 15 MB one, for a reader that looks at a handful of tokens. The name table
	// is read only to build that list, so it is not read when one is supplied.
	const tokens = scan ?? parseTokens(data, readNameTable(data).names).tokens;
	let fallback: Player | undefined;
	for (let i = 0; i < tokens.length; i += 1) {
		const token = tokens[i];
		if (token === undefined || token.tag !== "BS" || token.name !== "Player") {
			continue;
		}
		let id = "";
		let template = "";
		let position = "";
		for (let j = i + 1; j < tokens.length; j += 1) {
			const child = tokens[j];
			if (child === undefined || child.offset >= token.offset + 180) break;
			if (child.name === "id" && id === "") id = child.value?.text ?? "";
			else if (child.name === "template" && template === "") {
				template = child.value?.text ?? "";
			} else if (child.name === "position" && position === "") {
				position = child.value?.text ?? "";
			}
		}
		if (position.length !== VECTOR_HEX_LENGTH) continue;
		const [x, y, z] = decodeVector(position);
		const player: Player = { id, template, x, y, z };
		if (template.includes("player")) return player;
		fallback ??= player;
	}
	return fallback;
};
