import { Button, Divider, Text } from "@mantine/core";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";

/**
 * The action row above an expanded row: export a share card, and the two
 * outbound links into Wikipedia.
 *
 * Its own component because it is the only part of the expanded row that
 * performs a side effect, and because the two links are built from `record`
 * in ways that have nothing to do with the rasterise state the row holds.
 */
export const DetailsShareActions = ({
	record,
	downloading,
	error,
	onDownload,
}: {
	record: Birthday;
	/** True while html2canvas is running; blocks a second rasterise. */
	downloading: boolean;
	/** Inline error text; also raised as a toast by the caller. */
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
				// Mantine's `loading` swaps the left section for a spinner and
				// blocks the button, so a second click cannot queue a second
				// rasterise; `aria-busy` carries the same state to assistive
				// tech, which does not see the spinner.
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
