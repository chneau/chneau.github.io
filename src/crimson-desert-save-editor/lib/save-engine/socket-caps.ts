/**
 * TypeScript port of `public/python/editor/socket_caps.py`.
 *
 * Gameplay socket limits, kept separate from save-record capacity. The base
 * table comes from the upstream iteminfo extraction; current-build observations
 * override it, and verified in-game overrides win last.
 */

import {
	socketCapsCurrentGameTable,
	socketCapsGameDataTable,
	socketCapsVerifiedTable,
} from "./data";

type SocketCap = {
	itemKey: number;
	maxSockets: number;
	source: string;
	confidence: string;
	testedBuildId: string;
	notes: string;
};

const validate = (itemKey: number, cap: number, source: string): void => {
	if (itemKey <= 0) {
		throw new Error(`Invalid item key ${itemKey} in ${source}`);
	}
	if (cap < 0 || cap > 5) {
		throw new Error(
			`Invalid gameplay socket cap ${cap} for item ${itemKey} in ${source}`,
		);
	}
};

class SocketCapRegistry {
	caps = new Map<number, SocketCap>();

	get(itemKey: number): SocketCap | undefined {
		return this.caps.get(itemKey);
	}

	require(itemKey: number): SocketCap {
		const result = this.get(itemKey);
		if (!result) {
			throw new Error(
				"This item's gameplay socket cap is unknown; the serialized five-slot capacity is not a safe limit",
			);
		}
		return result;
	}

	get size(): number {
		return this.caps.size;
	}
}

let defaultCapsPromise: Promise<SocketCapRegistry> | undefined;

/** Shared cached registry used by the runtime worker. */
export const defaultSocketCaps = (): Promise<SocketCapRegistry> => {
	defaultCapsPromise ??= loadSocketCaps();
	return defaultCapsPromise;
};

const loadSocketCaps = async (): Promise<SocketCapRegistry> => {
	const registry = new SocketCapRegistry();

	const gameData = await socketCapsGameDataTable();
	const items =
		typeof gameData === "object" && gameData !== null && "items" in gameData
			? gameData.items
			: gameData;
	for (const [rawKey, rawCap] of Object.entries(items ?? {})) {
		const itemKey = Number(rawKey);
		const cap = Number(rawCap);
		validate(itemKey, cap, "item-limits.json");
		registry.caps.set(itemKey, {
			itemKey,
			maxSockets: cap,
			source: "upstream_iteminfo_table",
			confidence: "game_data",
			testedBuildId: "",
			notes: "Extracted from the upstream iteminfo gameplay-limit table.",
		});
	}

	const currentGame = await socketCapsCurrentGameTable();
	const buildId = String(currentGame.game?.steam_build_id ?? "");
	for (const [rawKey, entry] of Object.entries(currentGame.items ?? {})) {
		const itemKey = Number(rawKey);
		const cap = Number(entry.max_sockets);
		validate(itemKey, cap, "socket-caps-current-game.json");
		registry.caps.set(itemKey, {
			itemKey,
			maxSockets: cap,
			source: "installed_game_iteminfo",
			confidence: "game_data_current_build",
			testedBuildId: buildId,
			notes:
				"Read from the length of drop_default_data.add_socket_material_item_list.",
		});
	}

	const verified = await socketCapsVerifiedTable();
	const verifiedBuildId = String(verified.game?.tested_build_id ?? "");
	for (const [rawKey, entry] of Object.entries(verified.items ?? {})) {
		const itemKey = Number(rawKey);
		const cap = Number(entry.max_sockets);
		validate(itemKey, cap, "socket-caps-verified.json");
		registry.caps.set(itemKey, {
			itemKey,
			maxSockets: cap,
			source: String(entry.source ?? "verified_in_game"),
			confidence: String(entry.confidence ?? "verified"),
			testedBuildId: String(entry.tested_build_id ?? verifiedBuildId),
			notes: String(entry.notes ?? ""),
		});
	}

	return registry;
};
