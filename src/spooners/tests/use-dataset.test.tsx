import "../../shared/tests/happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { SpoonersCache } from "../types";
import { useDataset } from "../useDataset";

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

		expect(calls()).toBe(1);
		view.getByRole("button", { name: "Try again" });

		await act(async () => {
			fireEvent.click(view.getByRole("button", { name: "Try again" }));
		});

		expect(calls()).toBe(2);
		expect(view.queryByRole("button", { name: "Try again" })).toBeNull();
		expect(view.getByText("loaded")).toBeDefined();
	});

	test("a 200 response that is not a cache is an error, not an empty dataset", async () => {
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
