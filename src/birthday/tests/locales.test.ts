import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const LOCALES = ["en", "fr", "es", "de", "zh", "ty", "gd"] as const;
type Locale = (typeof LOCALES)[number];

const SOURCE: Locale = "en";

const load = (locale: Locale): Record<string, unknown> =>
	JSON.parse(
		readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), "utf8"),
	) as Record<string, unknown>;

const flatten = (
	value: unknown,
	prefix = "",
	out = new Map<string, string>(),
): Map<string, string> => {
	if (typeof value === "string") {
		out.set(prefix, value);
		return out;
	}
	if (value && typeof value === "object") {
		for (const [key, child] of Object.entries(value)) {
			flatten(child, prefix ? `${prefix}.${key}` : key, out);
		}
	}
	return out;
};

const placeholders = (value: string): string[] =>
	[
		...new Set(
			[...value.matchAll(/{{([^,}]+)/g)].map((m) => (m[1] ?? "").trim()),
		),
	]
		.filter(Boolean)
		.sort();

const en = flatten(load(SOURCE));

describe("locale files", () => {
	test("every locale file parses as JSON", () => {
		for (const locale of LOCALES) {
			expect(() => load(locale)).not.toThrow();
		}
	});

	test("English is non-trivial", () => {
		expect(en.size).toBeGreaterThan(400);
	});

	for (const locale of LOCALES) {
		if (locale === SOURCE) continue;

		describe(locale, () => {
			const target = flatten(load(locale));

			test("has exactly the English key set", () => {
				const missing = [...en.keys()].filter((k) => !target.has(k));
				const extra = [...target.keys()].filter((k) => !en.has(k));
				expect({ missing, extra }).toEqual({ missing: [], extra: [] });
			});

			test("uses the same interpolation variables as English", () => {
				const mismatched: string[] = [];
				for (const [key, value] of target) {
					const source = en.get(key);
					if (source === undefined) continue;
					if (
						JSON.stringify(placeholders(value)) !==
						JSON.stringify(placeholders(source))
					) {
						mismatched.push(
							`${key}: got ${JSON.stringify(
								placeholders(value),
							)}, English uses ${JSON.stringify(placeholders(source))}`,
						);
					}
				}
				expect(mismatched).toEqual([]);
			});

			test("has no empty values", () => {
				const empty = [...target]
					.filter(([, value]) => value.trim() === "")
					.map(([key]) => key);
				expect(empty).toEqual([]);
			});

			test("user-facing UI chrome is not left in English", () => {
				const UI = /^(app|manage|common|table|consent|biorhythms)\./;
				const COGNATE: Record<string, string> = {
					"app.filters.shortcuts.gen_z": "all - 'Gen Z' is a generation label",
					"app.header.github": "all - product name",
					"app.on_this_day_attribution_wikipedia": "all - product name",
					"app.on_this_day_attribution_license": "all - licence identifier",
					"app.on_this_day_source": "all - also the French word",
					"app.weather.codes.230": "fr - 'blizzard' is a French word",
					"manage.col_date": "fr - 'date' is the French word",
					"manage.col_actions": "fr - 'actions' is the French word",
					"app.weather.wind": "de - 'Wind' is the German word",
					"manage.col_name": "de - 'Name' is the German word",
					"table.name": "de - 'Name' is the German word",
					"table.in": "de - 'in' is the German word",
					"app.command.tab": "de - 'Tab' is the German word for a tab",
					"biorhythms.emotional": "de - 'emotional' is the German word",
				};
				const untranslated = [...target]
					.filter(([key, value]) => en.get(key) === value)
					.filter(([key]) => UI.test(key))
					.filter(([key]) => {
						const reason = COGNATE[key];
						if (reason === undefined) return true;
						return !(reason.startsWith("all") || reason.startsWith(locale));
					})
					.map(([key]) => key);
				expect(untranslated).toEqual([]);
			});

			test("data namespaces keep proper nouns and shared spellings", () => {
				const data = [...target].filter(([key]) => key.startsWith("data."));
				expect(data.length).toBeGreaterThan(50);
			});
		});
	}

	test("plural families are symmetric across locales", () => {
		const families = new Map<string, Set<string>>();
		const collect = (value: unknown, prefix = "") => {
			if (!value || typeof value !== "object") return;
			for (const [key, child] of Object.entries(value)) {
				const path = prefix ? `${prefix}.${key}` : key;
				const base = key.replace(/_(zero|one|two|few|many|other)$/, "");
				if (base !== key) {
					const set = families.get(base) ?? new Set<string>();
					set.add(key);
					families.set(base, set);
				}
				collect(child, path);
			}
		};
		for (const locale of LOCALES) collect(load(locale));

		const problems: string[] = [];
		for (const [base, forms] of families) {
			for (const locale of LOCALES) {
				const target = flatten(load(locale));
				const present = [...forms].filter((f) => target.has(`${base}.${f}`));
				if (present.length > 0 && present.length < forms.size) {
					problems.push(
						`${locale}: ${base} has ${present.join("/")}, expected ${[
							...forms,
						].join("/")}`,
					);
				}
			}
		}
		expect(problems).toEqual([]);
	});
});
