/**
 * Locale integrity across all seven shipped languages.
 *
 * This exists because the failure it guards against is silent and total: 64
 * keys were missing from every non-English locale, so the entire Manage modal,
 * the whole Weather tab and `common.cancel`/`common.confirm` rendered in
 * English for every non-English user. Nothing failed, nothing warned, and a
 * key-count spot check would not have caught it either - `en` and `fr` simply
 * had different shapes.
 *
 * Seven locales, not six: `gd` (Gàidhlig) is fully supported and offered in the
 * language menu, and `ty` (Tahitian) mirrors `fr` by the repo's convention.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const LOCALES = ["en", "fr", "es", "de", "zh", "ty", "gd"] as const;
type Locale = (typeof LOCALES)[number];

/** English is the source of truth: the i18next type union is derived from it. */
const SOURCE: Locale = "en";

const load = (locale: Locale): Record<string, unknown> =>
	JSON.parse(
		readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), "utf8"),
	) as Record<string, unknown>;

/** Every leaf path -> string, so a missing key is a missing leaf, not a branch. */
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

/**
 * The interpolation variables a string depends on.
 *
 * A missing placeholder renders a hole; an extra one renders empty. Both are
 * invisible in English and obvious in German, so this is checked per locale
 * rather than trusted. Plural selectors are reduced to their base variable
 * (`{{count, plural, ...}}` -> `count`) because the selector form is a
 * formatting choice, not a different variable.
 */
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
				// A locale can legitimately match English exactly: product
				// names, "CC BY-SA 4.0", "Gen Z", and gem names that are spelled
				// the same in French, Spanish and German. So a blanket
				// "not equal to English" check is the wrong instrument - it
				// flags ~5% of correct strings.
				//
				// What must never be English is the interface itself. That is
				// exactly the defect that shipped once: `app.hero.*` and
				// `app.list.*` were present in every file with the English
				// string verbatim, so a key-completeness check passed while a
				// French user's entire first screen stayed English.
				const UI = /^(app|manage|common|table|consent|biorhythms)\./;
				// Cognates: the French or German word is genuinely spelled the
				// same as the English one, so flagging them would make this
				// test noise to be silenced rather than a signal to act on.
				// Each entry is the language where the overlap is correct.
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
				// The reverse check on `data.*`: these SHOULD be identical far
				// more often, so a strict rule here would be wrong. This simply
				// records the expected shape and catches a wholesale wipe.
				const data = [...target].filter(([key]) => key.startsWith("data."));
				expect(data.length).toBeGreaterThan(50);
			});
		});
	}

	test("plural families are symmetric across locales", () => {
		// i18next silently falls back to English when a locale lacks a category
		// the language actually selects. Gaelic is the live case: with only
		// _one/_other, counts 2, 3, 5, 10, 12 and 13 leaked English mid-list.
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
