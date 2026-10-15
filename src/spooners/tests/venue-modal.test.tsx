import "../../shared/tests/happy-dom";
import { afterEach, describe, expect, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { VenueModal } from "../components/VenueModal";
import type { Formatter, ItemDefinition, SpoonersCache } from "../types";

afterEach(() => cleanup());

const definition = (menu: string, name: string): ItemDefinition => ({
	id: 1,
	name,
	description: null,
	calories: null,
	itemType: null,
	ageRestriction: null,
	category: "Beer",
	menu,
	keywords: [],
	optionGroups: {},
});

const image = (n: number) => `https://example.test/pub-${n}.jpg`;

const LONG_MENU = "Wine";
const LONG_ROWS = 120;
const longMenu = (count: number): Record<string, number> =>
	Object.fromEntries(
		Array.from({ length: count }, (_, index) => [`Wine ${index}`, 5]),
	);

const cache: SpoonersCache = {
	venueList: [],
	items: {
		Lager: definition("Drinks", "Lager"),
		Curry: definition("Food", "Curry"),
		...Object.fromEntries(
			Array.from({ length: LONG_ROWS }, (_, index) => [
				`Wine ${index}`,
				definition(LONG_MENU, `Wine ${index}`),
			]),
		),
	},
	venues: {
		"1": {
			venue: {
				id: 1,
				venueRef: 1,
				name: "Pub A",
				address: {
					line1: "1 High Street",
					location: { latitude: 51.5, longitude: -0.12 },
				},
			},
			detail: {
				currency: { code: "GBP" },
				displayImages: [image(1), image(2), image(3), image(4)],
			},
			menus: [],
			items: {
				Lager: { Pint: 5 },
				Curry: { Main: 12 },
				...longMenu(LONG_ROWS),
			},
		},
		"2": {
			venue: {
				id: 2,
				venueRef: 2,
				name: "Pub B",
				address: {
					line1: "2 Low Road",
					location: { latitude: 51.51, longitude: -0.13 },
				},
			},
			detail: {
				currency: { code: "GBP" },
				displayImages: [image(9)],
			},
			menus: [],
			items: { Curry: { Main: 9 } },
		},
	},
};

const format: Formatter = {
	money: (value, currency) => `${currency} ${value}`,
	metric: (kind, value) => `${kind} ${value}`,
	targetCurrency: null,
	convertMoney: (value) => value,
	convertMetric: (_kind, value) => value,
};

const Harness = () => {
	const [venueRef, setVenueRef] = useState<number | null>(1);
	return (
		<MantineProvider>
			<button type="button" onClick={() => setVenueRef(1)}>
				open pub A
			</button>
			<button type="button" onClick={() => setVenueRef(2)}>
				open pub B
			</button>
			<button type="button" onClick={() => setVenueRef(null)}>
				close
			</button>
			<VenueModal
				opened={venueRef != null}
				onClose={() => setVenueRef(null)}
				venueRef={venueRef}
				cache={cache}
				onSelectItem={() => {}}
				onAddItem={() => {}}
				onItem={() => {}}
				format={format}
			/>
		</MantineProvider>
	);
};

const view = async () => {
	const result = render(<Harness />);
	const root = () => within(result.baseElement);
	await act(async () => {
		await waitFor(() => {
			expect(root().getByText("Pub A")).toBeTruthy();
		});
	});
	return {
		base: result.baseElement,
		q: (role: string, name: RegExp | string) =>
			root().getByRole(role, { name }),
		qa: (role: string, name: RegExp | string) =>
			root().getAllByRole(role, { name }),
		byText: (text: RegExp | string) => root().queryByText(text),
		imageSources: () =>
			Array.from(result.baseElement.querySelectorAll("img"))
				.map((node) => node.getAttribute("src"))
				.filter((src): src is string => Boolean(src)),
		rows: () => root().queryAllByRole("button", { name: /Show only/ }).length,
	};
};

type View = Awaited<ReturnType<typeof view>>;

const click = async (element: Element) => {
	await act(async () => {
		fireEvent.click(element);
	});
};

const openPub = async (v: View, label: "open pub A" | "open pub B") => {
	await click(v.q("button", label));
};

describe("VenueModal starts each pub fresh", () => {
	test("the menu filter does not leak into the next pub", async () => {
		const v = await view();
		await click(v.q("radio", "Food"));
		expect(v.byText(/^Curry$/)).toBeTruthy();
		expect(v.byText(/^Lager$/)).toBeNull();

		await openPub(v, "open pub B");
		expect(v.byText("Nothing matched.")).toBeNull();
		expect(v.byText(/^Curry$/)).toBeTruthy();
	});

	test("a filter naming a menu this pub does not sell does not blank it", async () => {
		const v = await view();
		await click(v.q("radio", "Drinks"));
		expect(v.byText(/^Lager$/)).toBeTruthy();
		expect(v.byText(/^Curry$/)).toBeNull();

		await openPub(v, "open pub B");
		expect(v.byText("Nothing matched.")).toBeNull();
		expect(v.byText(/^Curry$/)).toBeTruthy();
	});

	test("the sort choice does not leak into the next pub", async () => {
		const v = await view();
		await click(v.q("radio", "Dearest"));
		await openPub(v, "open pub B");
		const [menuOption] = v.qa("radio", "Menu");
		expect(menuOption?.getAttribute("data-active")).not.toBe("true");
	});

	test("a hero photo index from another pub still shows a photo", async () => {
		const v = await view();
		await click(v.q("img", "Pub A photo 4"));

		await openPub(v, "open pub B");
		expect(v.imageSources()).toContain(image(9));
	});

	test("an expanded row does not leak into the next pub", async () => {
		const v = await view();
		await click(v.q("button", "Curry"));
		expect(v.byText(/Full details & best value/)).toBeTruthy();

		await openPub(v, "open pub B");
		expect(v.byText(/Full details & best value/)).toBeNull();
	});

	test("the show-more page size does not leak into the next pub", async () => {
		const v = await view();
		expect(v.rows()).toBe(100);
		await click(v.q("button", /^Show \d+ more/));
		expect(v.rows()).toBe(122);

		await openPub(v, "open pub B");
		expect(v.byText(/^Show \d+ more/)).toBeNull();
		expect(v.rows()).toBe(1);
	});

	test("re-opening the same pub also resets", async () => {
		const v = await view();
		await click(v.q("radio", "Food"));
		expect(v.byText(/^Lager$/)).toBeNull();

		await click(v.q("button", "close"));
		await openPub(v, "open pub A");
		expect(v.byText(/^Lager$/)).toBeTruthy();
		expect(v.rows()).toBe(100);
	});
});
