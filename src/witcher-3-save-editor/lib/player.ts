import { readNameTable } from "./names";
import { parseTokens, type Token } from "./tokens";

type Player = {
	readonly id: string;
	readonly template: string;
	readonly x: number;
	readonly y: number;
	readonly z: number;
};

const VECTOR_HEX_LENGTH = 70;

const decodeVector = (hex: string): [number, number, number] => {
	const parts = hex.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? [];
	const floatAt = (i: number): number => {
		const b = parts.slice(1 + i * 8 + 4, 1 + i * 8 + 8);
		return new DataView(new Uint8Array(b).buffer).getFloat32(0, true);
	};
	return [floatAt(0), floatAt(1), floatAt(2)];
};

export const readPlayer = (
	data: Uint8Array,
	scan?: readonly Token[],
): Player | undefined => {
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
