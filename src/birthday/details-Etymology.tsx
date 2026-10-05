import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";

/**
 * The etymology line for one person.
 *
 * Its own component because it is the one place in the expanded row whose
 * translation keys are built at runtime from a name out of the dataset — the
 * `i18n.exists` guard and the joined `&` pairs are a rule of their own and do
 * not belong in the middle of the row's composition.
 */
export const DetailsEtymology = ({ record }: { record: Birthday }) => {
	const { t, i18n } = useTranslation();

	return (
		<div style={{ marginTop: 12, marginBottom: 16 }}>
			<Text fw={600} component="span">
				📜 {t("headers.etymology")}:
			</Text>
			<Text fs="italic" component="span">
				{record.name
					.split(" & ")
					.map((n) => {
						const key = `data.names.${n}`;
						// The key is built from a person's name out of the
						// dataset, so no key union can cover it — `t()` would
						// reject it at compile time for being unknown, which is
						// the normal case here. `i18n.exists` is the guard that
						// fits: a name with no etymology entry renders the plain
						// name rather than the key.
						const hasKey = i18n.exists(key);
						const ety = hasKey
							? (i18n.t as unknown as (k: string) => string)(key)
							: "";
						return ety
							? record.name.includes(" & ")
								? `${n}: ${ety}`
								: ety
							: record.name.includes(" & ")
								? n
								: t("app.no_data");
					})
					.join(" | ")}
			</Text>
		</div>
	);
};
