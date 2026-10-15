import { z } from "zod";
import { birthdaySchema, type RawBirthday } from "./birthdays";
import { dedupeRecords } from "./raw-birthday-identity";

type ImportParse =
	| {
			readonly ok: true;
			readonly records: RawBirthday[];
			readonly duplicateCount: number;
	  }
	| { readonly ok: false; readonly reason: "unreadable" | "invalid" };

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
