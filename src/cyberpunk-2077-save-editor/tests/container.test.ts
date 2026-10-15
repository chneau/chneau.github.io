import { describe, expect, test } from "bun:test";
import {
	decodeContainer,
	encodeContainer,
	findNode,
	walkNodes,
} from "../lib/container";
import { buildSave } from "./synthetic";

const NODES = [
	"inventory",
	"CharacetrCustomization_Appearances",
	"FactsDB",
	"ScriptableSystemsContainer",
	"godModeSystem",
	"StatsSystem",
	"StatPoolsSystem",
	"PSData",
];

describe("VASC container", () => {
	test("reads the header the game writes", async () => {
		const bytes = buildSave({
			nodes: [{ name: "alpha", data: [1] }],
			v1: 269,
			v2: 2310,
			v3: 192,
			suk: "CyberpunkSaveGame",
		});
		const decoded = await decodeContainer(bytes);
		expect(decoded.version.v1).toBe(269);
		expect(decoded.version.v2).toBe(2310);
		expect(decoded.version.v3).toBe(192);
		expect(decoded.version.suk).toBe("CyberpunkSaveGame");
		expect(decoded.version.ps4w).toBe(false);
	});

	test("omits v3 below revision 83, as the header layout does", async () => {
		const bytes = buildSave({ nodes: [{ name: "alpha", data: [1] }], v1: 60 });
		const decoded = await decodeContainer(bytes);
		expect(decoded.version.v1).toBe(60);
		expect(decoded.version.v3).toBe(192);
	});

	test("rebuilds an untouched save byte for byte", async () => {
		const bytes = buildSave({ nodes: shapedNodes() });
		const decoded = await decodeContainer(bytes);
		const rebuilt = await encodeContainer(decoded);
		expect([...rebuilt]).toEqual([...bytes]);
	});

	test("round-trips byte for byte with a save large enough to need several chunks", async () => {
		const bulk = new Uint8Array(700_000);
		for (let index = 0; index < bulk.length; index += 1) {
			bulk[index] = (index * 31 + (index >> 5)) & 0xff;
		}
		const bytes = buildSave({
			nodes: [
				{ name: "bulk", data: [...bulk] },
				{ name: "tail", data: [7, 7, 7] },
			],
		});
		const decoded = await decodeContainer(bytes);
		const rebuilt = await encodeContainer(decoded);
		expect([...rebuilt]).toEqual([...bytes]);
		expect(decoded.root.children).toHaveLength(2);
	});

	test("reads a console save whose chunks are stored uncompressed", async () => {
		const bytes = buildSave({
			nodes: shapedNodes(),
			uncompressed: true,
		});
		const decoded = await decodeContainer(bytes);
		expect(decoded.version.ps4w).toBe(true);
		expect(decoded.root.children.map((node) => node.name)).toEqual(NODES);
		const rebuilt = await encodeContainer(decoded);
		const again = await decodeContainer(rebuilt);
		expect(again.root.children.map((node) => node.name)).toEqual(NODES);
		expect(again.version.ps4w).toBe(true);
	});

	test("keeps payload that sits between a node and its children", async () => {
		const inner = new Uint8Array(await payloadBetweenNodes());
		const bytes = buildSave({
			nodes: [
				{
					name: "outer",
					data: [1, 2],
					children: [{ name: "inner", data: [3] }],
				},
			],
		});
		const decoded = await decodeContainer(bytes);
		const rebuilt = await encodeContainer(decoded);
		const again = await decodeContainer(rebuilt);
		expect([...again.nodeData.subarray(decoded.padSize)]).toEqual([
			...decoded.nodeData.subarray(decoded.padSize),
		]);
		expect(inner.length).toBeGreaterThan(0);
	});

	test("refuses a file that is not a save", async () => {
		const notASave = new Uint8Array(256);
		await expect(decodeContainer(notASave)).rejects.toThrow(/not a Cyberpunk/);
	});

	test("refuses a file whose node stream was assembled out of order", async () => {
		const bytes = buildSave({
			nodes: [
				{ name: "alpha", data: [1] },
				{ name: "beta", data: [2] },
			],
			tamperIndexOf: 1,
		});
		await expect(decodeContainer(bytes)).rejects.toThrow(/out of order/);
	});

	test("finds a node anywhere in the tree", async () => {
		const bytes = buildSave({ nodes: shapedNodes() });
		const decoded = await decodeContainer(bytes);
		expect(findNode(decoded.root, "PSData")?.name).toBe("PSData");
		expect(findNode(decoded.root, "NotThere")).toBeUndefined();
		expect(walkNodes(decoded.root).length).toBe(NODES.length + 1);
	});
});

const shapedNodes = (): {
	name: string;
	data: number[];
}[] =>
	NODES.map((name, index) => ({ name, data: [index, index + 1, index + 2] }));

const payloadBetweenNodes = async (): Promise<Uint8Array> => {
	const bytes = buildSave({
		nodes: [
			{
				name: "outer",
				data: [1, 2],
				children: [{ name: "inner", data: [3, 4] }],
			},
		],
	});
	const decoded = await decodeContainer(bytes);
	const outer = decoded.root.children[0];
	if (outer === undefined) {
		throw new Error("The fixture produced no root node.");
	}
	return new Uint8Array([...outer.data, ...outer.afterChildren]);
};
