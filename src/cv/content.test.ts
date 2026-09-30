import { describe, expect, test } from "bun:test";
import { CONTACTS, JOBS, SKILLS, skillSearchUrl } from "./content";

describe("skillSearchUrl", () => {
	test("maps exact language names to a GitHub language filter", () => {
		expect(skillSearchUrl("Go")).toBe(
			"https://github.com/chneau?tab=repositories&language=go",
		);
		expect(skillSearchUrl("Go Backend")).toBe(
			"https://github.com/chneau?tab=repositories&language=go",
		);
		expect(skillSearchUrl("TypeScript")).toBe(
			"https://github.com/chneau?tab=repositories&language=typescript",
		);
		expect(skillSearchUrl("C#")).toBe(
			"https://github.com/chneau?tab=repositories&language=csharp",
		);
		expect(skillSearchUrl("C++")).toBe(
			"https://github.com/chneau?tab=repositories&language=cpp",
		);
		expect(skillSearchUrl("Bash")).toBe(
			"https://github.com/chneau?tab=repositories&language=shell",
		);
	});

	test("falls back to ordered keyword matches", () => {
		expect(skillSearchUrl("SimPy Simulation")).toBe(
			"https://github.com/chneau?tab=repositories&language=python",
		);
		expect(skillSearchUrl("GIS / OSRM matrices")).toBe(
			"https://github.com/chneau?tab=repositories&q=osrm",
		);
		expect(skillSearchUrl("React 19")).toBe(
			"https://github.com/chneau?tab=repositories&q=react",
		);
		expect(skillSearchUrl("GitHub Actions")).toBe(
			"https://github.com/chneau?tab=repositories&q=github-actions",
		);
		expect(skillSearchUrl("Constraint Solving (CSP)")).toBe(
			"https://github.com/chneau?tab=repositories&q=timetable",
		);
		expect(skillSearchUrl("Zero-Allocation Algorithms")).toBe(
			"https://github.com/chneau?tab=repositories&q=openhours",
		);
	});

	test("falls back to the first alphanumeric word", () => {
		expect(skillSearchUrl("Terraform")).toBe(
			"https://github.com/chneau?tab=repositories&q=terraform",
		);
		expect(skillSearchUrl(".NET")).toBe(
			"https://github.com/chneau?tab=repositories&q=net",
		);
	});
});

describe("CV content", () => {
	test("every skill group has a name and items", () => {
		expect(SKILLS.length).toBeGreaterThan(0);
		for (const group of SKILLS) {
			expect(group.category.length).toBeGreaterThan(0);
			expect(group.items.length).toBeGreaterThan(0);
		}
	});

	test("contacts expose a label, value and href", () => {
		expect(CONTACTS.length).toBeGreaterThan(0);
		for (const contact of CONTACTS) {
			expect(contact.label.length).toBeGreaterThan(0);
			expect(contact.value.length).toBeGreaterThan(0);
			expect(contact.href.length).toBeGreaterThan(0);
		}
	});

	test("job point ids are unique per job", () => {
		for (const job of JOBS) {
			const ids = job.points.map((point) => point.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
});
