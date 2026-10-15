import { Button, Divider, Text } from "@mantine/core";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";

export const DetailsShareActions = ({
	record,
	downloading,
	error,
	onDownload,
}: {
	record: Birthday;
	downloading: boolean;
	error: string | null;
	onDownload: () => void;
}) => {
	const { t } = useTranslation();

	return (
		<div
			style={{
				display: "flex",
				gap: 12,
				flexWrap: "wrap",
				alignItems: "center",
				marginBottom: 12,
			}}
		>
			<Button
				leftSection={<span>📸</span>}
				size="sm"
				loading={downloading}
				aria-busy={downloading}
				onClick={onDownload}
			>
				{t("app.card")}
			</Button>
			{error && (
				<Text size="xs" c="red" role="alert">
					{error}
				</Text>
			)}
			<Divider orientation="vertical" style={{ height: 20 }} />
			<a
				href={`https://en.wikipedia.org/wiki/${record.year}`}
				target="_blank"
				rel="noreferrer"
				style={{ fontSize: "13px" }}
			>
				📜 Year {record.year} on Wikipedia
			</a>
			<Divider orientation="vertical" style={{ height: 20 }} />
			<a
				href={`https://en.wikipedia.org/wiki/${dayjs(record.birthday)
					.locale("en")
					.format("MMMM")}_${record.day}`}
				target="_blank"
				rel="noreferrer"
				style={{ fontSize: "13px" }}
			>
				📅 {t("app.events")} on Wikipedia
			</a>
		</div>
	);
};
