import "./happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { SpoonersCache } from "../types";
import { useDataset } from "../useDataset";

/**
 * `reload` has to actually refetch.
 *
 * The retry counter was named `_attempt`, so `noUnusedLocals` stayed quiet about
 * a value the load effect never read — and that effect's dependency array was
 * `[]`, so incrementing the counter re-rendered nothing that would fetch. "Try
 * again" on the dataset error screen did nothing, and every other suite stayed
 * green because none of them mounted the hook.
 *
 * The underscore was the tell: it exists only to silence the compiler about a
 * value nothing consumes.
 */
/**
 * A cache that satisfies the schema `useDataset` now checks.
 *
 * The four top-level keys are what the app indexes; the schema uses `z.custom` for
 * the element shapes, so empty containers are enough here. The previous fixture
 * invented keys (`items` as an array, `keywords`) and needed `as unknown as` to be
 * accepted — which is exactly what a cast does, and why the cast could never catch
 * a wrong shape.
 */
const CACHE: SpoonersCache = {
	venueList: [],
	items: {},
	venues: {},
	fetchedAt: "2026-01-01T00:00:00.000Z",
};

const jsonResponse = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});

/**
 * Counts calls and fails the first `failures` of them, so a retry can be told
 * apart from the attempt that already failed.
 *
 * Built with `Object.assign` rather than assigned or `spyOn`'d directly: Bun's
 * `fetch` is one call signature plus a `preconnect` extension, so a bare
 * function is not assignable and would need a cast. Carrying `preconnect` over
 * from the real function makes this a genuine `typeof fetch` with no cast and
 * nothing suppressed.
 */
const realFetch = globalThis.fetch;

const installFetch = (failures: number) => {
	let calls = 0;
	const stub: typeof fetch = Object.assign(
		async () => {
			calls += 1;
			return calls <= failures
				? new Response("nope", { status: 503 })
				: jsonResponse(CACHE);
		},
		{ preconnect: realFetch.preconnect },
	);
	globalThis.fetch = stub;
	return () => calls;
};

/**
 * A `fetch` that always answers 200 with `body`.
 *
 * Same cast-free construction as {@link installFetch}; a bare function is not
 * assignable to Bun's `fetch`, which also carries `preconnect`.
 */
const installFixedResponse = (body: unknown) => {
	const stub: typeof fetch = Object.assign(async () => jsonResponse(body), {
		preconnect: realFetch.preconnect,
	});
	globalThis.fetch = stub;
};

afterEach(() => {
	globalThis.fetch = realFetch;
	cleanup();
});

/** The error screen's own shape: a button wired to `reload`. */
const Harness = () => {
	const { data, error, reload } = useDataset();
	if (data) return <p>loaded</p>;
	return (
		<button type="button" onClick={reload}>
			{error ? "Try again" : "Loading"}
		</button>
	);
};

describe("useDataset", () => {
	test("a failed load reports the error and retrying refetches", async () => {
		const calls = installFetch(1);

		const view = render(<Harness />);
		await act(async () => {
			await Promise.resolve();
		});

		// The first attempt has settled into the error branch.
		expect(calls()).toBe(1);
		view.getByRole("button", { name: "Try again" });

		await act(async () => {
			fireEvent.click(view.getByRole("button", { name: "Try again" }));
		});

		// Before the fix this stayed at 1: the counter moved, the effect's `[]`
		// deps meant no refetch, and the button did nothing at all.
		expect(calls()).toBe(2);
		expect(view.queryByRole("button", { name: "Try again" })).toBeNull();
		expect(view.getByText("loaded")).toBeDefined();
	});

	test("a 200 response that is not a cache is an error, not an empty dataset", async () => {
		// This is what the shape check earns its place on: a valid status and valid
		// JSON carrying the wrong keys. Before it, that was accepted as a cache and
		// rendered as an app with no pubs.
		installFixedResponse({ areas: [], keywords: [] });

		const view = render(<Harness />);
		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(view.queryByText("loaded")).toBeNull();
		expect(view.getByRole("button", { name: "Try again" })).toBeDefined();
	});

	test("a failed load surfaces the error rather than reporting success", async () => {
		const calls = installFetch(1);

		const view = render(<Harness />);
		await act(async () => {
			await Promise.resolve();
		});

		expect(view.queryByRole("button", { name: "Loading" })).toBeNull();
		expect(view.getByRole("button", { name: "Try again" })).toBeDefined();
		expect(view.queryByText("loaded")).toBeNull();
		expect(calls()).toBe(1);
	});
});
