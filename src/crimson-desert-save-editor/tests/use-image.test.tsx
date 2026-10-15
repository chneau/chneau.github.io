import "../../shared/tests/happy-dom";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { picturePath } from "../components/picture-path";
import itemPaths from "../lib/generated/item-image-paths.json";
import { useImage } from "../lib/image-archive";

const root = join(import.meta.dir, "..");

const picture = (() => {
	const first = Object.keys(itemPaths)[0];
	const path = first === undefined ? undefined : picturePath("item", first);
	if (path === undefined) throw new Error("the item picture table is empty");
	return path;
})();

const created: string[] = [];
const revoked: string[] = [];

const realFetch = globalThis.fetch;
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;

const installFetch = () => {
	const stub: typeof fetch = Object.assign(
		async (input: string | URL | Request) => {
			const url = String(input);
			const index = url.slice(
				url.lastIndexOf("part-") + "part-".length,
				url.lastIndexOf("."),
			);
			const bytes = readFileSync(
				join(root, "assets", "image-archive", `part-${index}.zip`),
			);
			return new Response(new Uint8Array(bytes), { status: 200 });
		},
		{ preconnect: realFetch.preconnect },
	);
	globalThis.fetch = stub;
};

const settle = async () => {
	for (let attempt = 0; attempt < 40 && created.length === 0; attempt++) {
		const tick = Promise.withResolvers<void>();
		setTimeout(tick.resolve, 5);
		await act(() => tick.promise);
	}
};

beforeEach(() => {
	created.length = 0;
	revoked.length = 0;
	installFetch();
	URL.createObjectURL = () => {
		const url = `blob:stub-${created.length}`;
		created.push(url);
		return url;
	};
	URL.revokeObjectURL = (url: string) => {
		revoked.push(url);
	};
});

afterEach(() => {
	cleanup();
	globalThis.fetch = realFetch;
	URL.createObjectURL = realCreate;
	URL.revokeObjectURL = realRevoke;
});

const Picture = ({ path }: { path: string }) => {
	const source = useImage(path);
	return <img alt="" src={source} />;
};

test("a re-render keeps the picture's object URL instead of revoking it", async () => {
	const view = render(<Picture path={picture} />);
	await settle();

	const image = view.container.querySelector("img");
	const source = image?.getAttribute("src") ?? "";
	expect(source).toBeString();
	expect(source).not.toBe("");
	expect(created.length).toBe(1);

	view.rerender(<Picture path={picture} />);
	await act(async () => {});

	expect(revoked).toEqual([]);
	expect(created.length).toBe(1);
	expect(image?.getAttribute("src") ?? null).toBe(source);

	view.unmount();
	expect(revoked).toEqual([source]);
});
