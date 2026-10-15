import "../../shared/tests/happy-dom";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { BirthdayTable, withRowKeys } from "../BirthdayTable";
import { type RawBirthday, recomputeBirthdays } from "../birthdays";
import {
	dedupeRecords,
	hasDuplicate,
	indexOfOccurrence,
	ManageBirthdaysModal,
	withRawKeys,
} from "../ManageBirthdaysModal";

mock.module("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { exists: () => false, t: (key: string) => key, language: "en" },
	}),
}));

const notices: { level: string; message: string }[] = [];
mock.module("../notify", () => ({
	notify: {
		success: (message: string) => notices.push({ level: "success", message }),
		info: (message: string) => notices.push({ level: "info", message }),
		warning: (message: string) => notices.push({ level: "warning", message }),
		error: (message: string) => notices.push({ level: "error", message }),
	},
}));

const BOY = "\u2642\uFE0F";
const GIRL = "\u2640\uFE0F";

const STORAGE_KEY = "custom_birthdays_data";

const ada: RawBirthday = { name: "Ada", date: "1990-01-01", kind: BOY };
const grace: RawBirthday = { name: "Grace", date: "1991-02-02", kind: GIRL };
const adaOnDefaultDate: RawBirthday = {
	name: "Ada",
	date: "1995-01-01",
	kind: BOY,
};

const seed = (...records: RawBirthday[]) => {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

const stored = (): RawBirthday[] =>
	JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");

const wrap = (node: ReactNode) => (
	<MantineProvider>
		<DatesProvider settings={{ locale: "en" }}>{node}</DatesProvider>
	</MantineProvider>
);

const byLabel = (label: string): HTMLInputElement => {
	const target = [...document.querySelectorAll("label")].find(
		(l) => l.textContent?.trim() === label,
	);
	const id = target?.getAttribute("for");
	const input = id ? document.getElementById(id) : null;
	if (!(input instanceof HTMLInputElement)) {
		throw new Error(`no input labelled ${label}`);
	}
	return input;
};

const NATIVE_VALUE = Object.getOwnPropertyDescriptor(
	HTMLInputElement.prototype,
	"value",
)?.set;

const type = async (input: HTMLInputElement, value: string) => {
	await act(async () => {
		fireEvent.focusIn(input);
		NATIVE_VALUE?.call(input, value);
		fireEvent.keyDown(input, { key: value.slice(-1) || "a" });
	});
};

const click = async (target: Element) => {
	await act(async () => {
		fireEvent.click(target);
	});
};

const byRole = (name: string) =>
	[...document.querySelectorAll<HTMLElement>("button, [role=button]")].find(
		(el) =>
			el.getAttribute("aria-label") === name || el.textContent?.trim() === name,
	);

const editButtons = () =>
	[...document.querySelectorAll("button")].filter((b) =>
		b.getAttribute("aria-label")?.startsWith("manage.edit_aria"),
	);

const deleteButtons = () =>
	[...document.querySelectorAll("button")].filter((b) =>
		b.getAttribute("aria-label")?.startsWith("manage.delete_aria"),
	);

const openModal = async () => {
	render(wrap(<ManageBirthdaysModal open={true} onClose={() => undefined} />));
	await act(async () => {
		await Promise.resolve();
	});
};

const fileInput = () => {
	const input = document.querySelector<HTMLInputElement>('input[type="file"]');
	if (!input) throw new Error("file input missing");
	return input;
};

const waitFor = async (ready: () => boolean, what: string) => {
	for (let attempt = 0; attempt < 200; attempt++) {
		if (ready()) return;
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
	}
	throw new Error(`timed out waiting for ${what}`);
};

const importJson = async (payload: unknown) => {
	const input = fileInput();
	const file = new File([JSON.stringify(payload)], "birthdays.json", {
		type: "application/json",
	});
	await act(async () => {
		Object.defineProperty(input, "files", { value: [file] });
		fireEvent.change(input);
	});
	await waitFor(
		() => byRole("manage.import_confirm") !== undefined,
		"the import confirmation",
	);
};

beforeEach(() => {
	notices.length = 0;
	localStorage.clear();
});

afterEach(cleanup);

describe("add", () => {
	test("a duplicate (name, date) is refused", async () => {
		seed(adaOnDefaultDate);
		await openModal();
		await click(byRole("manage.add") ?? document.body);
		await type(byLabel("manage.name_label"), "Ada");
		await click(byRole("manage.save") ?? document.body);

		expect(stored()).toEqual([adaOnDefaultDate]);
		expect(document.body.textContent).toContain("manage.duplicate_entry");
		expect(byRole("manage.save")).not.toBeNull();
		expect(notices).toEqual([]);
	});

	test("the same name on a different date is a different record", async () => {
		seed(ada);
		await openModal();
		await click(byRole("manage.add") ?? document.body);
		await type(byLabel("manage.name_label"), "Ada");
		await click(byRole("manage.save") ?? document.body);

		expect(stored()).toEqual([ada, adaOnDefaultDate]);
		expect(notices.map((n) => n.message)).toEqual(["manage.added"]);
	});

	test("a different name on the same date is a different record", async () => {
		seed(adaOnDefaultDate);
		await openModal();
		await click(byRole("manage.add") ?? document.body);
		await type(byLabel("manage.name_label"), "Grace");
		await click(byRole("manage.save") ?? document.body);

		expect(stored()).toEqual([
			adaOnDefaultDate,
			{ name: "Grace", date: "1995-01-01", kind: BOY },
		]);
	});
});

describe("edit", () => {
	test("an unchanged save does not collide with itself", async () => {
		seed(ada, grace);
		await openModal();
		await click(editButtons()[0] ?? document.body);
		await click(byRole("manage.save") ?? document.body);

		expect(stored()).toEqual([ada, grace]);
		expect(notices.map((n) => n.message)).toEqual(["manage.updated"]);
		expect(document.body.textContent).not.toContain("manage.duplicate_entry");
	});

	test("a rename onto another record's identity is refused", async () => {
		seed(ada, { name: "Grace", date: "1990-01-01", kind: GIRL });
		await openModal();
		await click(editButtons()[0] ?? document.body);
		await type(byLabel("manage.name_label"), "Grace");
		await click(byRole("manage.save") ?? document.body);

		expect(stored()).toEqual([
			ada,
			{ name: "Grace", date: "1990-01-01", kind: GIRL },
		]);
		expect(document.body.textContent).toContain("manage.duplicate_entry");
		expect(notices).toEqual([]);
	});

	test("editing the second of two duplicates rewrites only that one", async () => {
		seed(ada, ada, { name: "Ada", date: "1990-01-01", kind: GIRL });
		await openModal();
		expect(editButtons().length).toBe(3);
		await click(editButtons()[1] ?? document.body);
		await type(byLabel("manage.name_label"), "Ada Lovelace");
		await click(byRole("manage.save") ?? document.body);

		expect(stored()).toEqual([
			ada,
			{ name: "Ada Lovelace", date: "1990-01-01", kind: BOY },
			{ name: "Ada", date: "1990-01-01", kind: GIRL },
		]);
	});
});

describe("delete", () => {
	test("removes one record, not every record sharing its identity", async () => {
		seed(ada, ada, { name: "Ada", date: "1990-01-01", kind: GIRL });
		await openModal();
		expect(deleteButtons().length).toBe(3);
		await click(deleteButtons()[1] ?? document.body);
		await click(byRole("manage.delete_confirm") ?? document.body);

		expect(stored()).toEqual([
			ada,
			{ name: "Ada", date: "1990-01-01", kind: GIRL },
		]);
	});

	test("a unique record is still deleted", async () => {
		seed(ada, grace);
		await openModal();
		await click(deleteButtons()[0] ?? document.body);
		await click(byRole("manage.delete_confirm") ?? document.body);
		expect(stored()).toEqual([grace]);
	});
});

describe("import", () => {
	test("duplicates inside the file are dropped and reported", async () => {
		seed(ada);
		await openModal();
		await importJson([grace, ada, ada]);
		await click(byRole("manage.import_confirm") ?? document.body);

		expect(stored()).toEqual([grace, ada]);
		expect(notices.map((n) => n.message)).toEqual([
			"manage.imported",
			"manage.import_duplicates_skipped",
		]);
	});

	test("a file of nothing but duplicates keeps the first of them", async () => {
		seed(ada, grace);
		await openModal();
		await importJson([ada, ada, ada]);
		await click(byRole("manage.import_confirm") ?? document.body);

		expect(stored()).toEqual([ada]);
		expect(notices.map((n) => n.message)).toEqual([
			"manage.imported",
			"manage.import_duplicates_skipped",
		]);
	});

	test("an empty file is refused instead of wiping the list", async () => {
		seed(ada, grace);
		await openModal();
		await importJson([]);
		await click(byRole("manage.import_confirm") ?? document.body);

		expect(stored()).toEqual([ada, grace]);
		expect(notices.map((n) => n.level)).toEqual(["error"]);
	});

	test("a clean file is imported as-is", async () => {
		seed(ada);
		await openModal();
		await importJson([grace]);
		await click(byRole("manage.import_confirm") ?? document.body);

		expect(stored()).toEqual([grace]);
		expect(notices.map((n) => n.message)).toEqual(["manage.imported"]);
	});
});

describe("manage table row identity", () => {
	test("duplicate identities get distinct keys and occurrences", () => {
		const rows = withRawKeys([ada, ada, ada]);
		expect(rows.map((row) => row.occurrence)).toEqual([0, 1, 2]);
		expect(new Set(rows.map((row) => row.key)).size).toBe(3);
	});

	test("an occurrence resolves to exactly one index", () => {
		const list = [ada, ada, grace];
		const second = withRawKeys(list)[1];
		expect(second).toBeDefined();
		if (!second) return;
		expect(indexOfOccurrence(list, second.record, second.occurrence)).toBe(1);
		expect(indexOfOccurrence(list, second.record, 0)).toBe(0);
		expect(indexOfOccurrence(list, second.record, 9)).toBe(-1);
	});

	test("hasDuplicate ignores the record being edited", () => {
		const list = [ada, grace];
		expect(hasDuplicate(list, ada, 0)).toBe(false);
		expect(hasDuplicate(list, ada)).toBe(true);
		expect(
			hasDuplicate(list, { name: "Alan", date: "1990-01-01", kind: BOY }),
		).toBe(false);
	});

	test("dedupeRecords keeps the first of each identity", () => {
		const result = dedupeRecords([ada, grace, ada, grace, ada]);
		expect(result.records).toEqual([ada, grace]);
		expect(result.duplicateCount).toBe(3);
	});
});

describe("BirthdayTable row identity", () => {
	test("duplicate identities get distinct keys", () => {
		const rows = withRowKeys([
			{ name: "Ada", birthdayString: "1990-01-01", kind: BOY },
			{ name: "Ada", birthdayString: "1990-01-01", kind: BOY },
		]);
		expect(rows[0]?.key).toBeDefined();
		expect(rows[0]?.key).not.toBe(rows[1]?.key);
	});

	test("kind is part of the key, since CRUD keys on name+date alone", () => {
		const rows = withRowKeys([
			{ name: "Ada", birthdayString: "1990-01-01", kind: BOY },
			{ name: "Ada", birthdayString: "1990-01-01", kind: GIRL },
		]);
		expect(rows[0]?.key).not.toBe(rows[1]?.key);
	});

	test("two duplicate rows expand independently", async () => {
		seed(ada, ada, { name: "Ada", date: "1990-01-01", kind: GIRL });
		const data = recomputeBirthdays();
		expect(data.length).toBe(3);
		expect(new Set(withRowKeys(data).map((row) => row.key)).size).toBe(3);

		const view = render(wrap(<BirthdayTable data={data} />));
		await act(async () => {
			await Promise.resolve();
		});

		const toggles = () => [
			...view.container.querySelectorAll<HTMLButtonElement>(
				"tr:not(.tk-expanded-row) > td:first-child button",
			),
		];
		const expandedCount = () =>
			view.container.querySelectorAll(".tk-expanded-row").length;

		expect(toggles().length).toBe(3);
		expect(
			toggles().every((b) => b.getAttribute("aria-expanded") === "false"),
		).toBe(true);

		await click(toggles()[0] ?? document.body);
		expect(toggles()[0]?.getAttribute("aria-expanded")).toBe("true");
		expect(toggles()[1]?.getAttribute("aria-expanded")).toBe("false");
		expect(toggles()[2]?.getAttribute("aria-expanded")).toBe("false");
		expect(expandedCount()).toBe(1);

		await click(toggles()[1] ?? document.body);
		expect(toggles()[1]?.getAttribute("aria-expanded")).toBe("true");
		expect(toggles()[0]?.getAttribute("aria-expanded")).toBe("false");
		expect(toggles()[2]?.getAttribute("aria-expanded")).toBe("false");
		expect(expandedCount()).toBe(1);
	});
});
