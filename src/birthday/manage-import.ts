import { z } from "zod";
import { birthdaySchema, type RawBirthday } from "./birthdays";
import { dedupeRecords } from "./raw-birthday-identity";

/**
 * Reading a `.json` the user picked into records the app can store.
 *
 * A file is untrusted input, so the parse result is a discriminated union and
 * the caller has to handle the failure — that is the whole point of not
 * letting the FileReader callback decide what a notification says.
 */
type ImportParse =
	| {
			readonly ok: true;
			readonly records: RawBirthday[];
			readonly duplicateCount: number;
	  }
	| { readonly ok: false; readonly reason: "unreadable" | "invalid" };

/**
 * Duplicates inside the file are dropped here rather than on confirm, and
 * counted so the user is told what was left out.
 */
export const parseBirthdaysJson = (text: string): ImportParse => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, reason: "unreadable" };
	}

	const result = z.array(birthdaySchema).safeParse(parsed);
	if (!result.success) return { ok: false, reason: "invalid" };

	const { records, duplicateCount } = dedupeRecords(result.data);
	return { ok: true, records, duplicateCount };
};
