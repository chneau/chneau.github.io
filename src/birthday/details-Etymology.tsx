import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";

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
