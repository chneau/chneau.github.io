import { Alert } from "@mantine/core";
import { lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { birthdays } from "./birthdays";
import {
	getDuplicateRecords,
	getSameNamedRecords,
	isSameRecord,
} from "./compatibility";
import { DetailsEtymology } from "./details-Etymology";
import { DetailsInfoCards } from "./details-InfoCards";
import { DetailsShareActions } from "./details-ShareActions";
import { notify } from "./notify";
import { OnThisDay } from "./OnThisDay";
import { ShareCard } from "./ShareCard";
import { shareCardFileName } from "./share-card-file-name";

const BiorhythmsChart = lazy(() =>
	import("./BiorhythmsChart").then((m) => ({ default: m.BiorhythmsChart })),
);

type BirthdayDetailsProps = {
	record: Birthday;
};

export const BirthdayDetails = ({ record }: BirthdayDetailsProps) => {
	const { t } = useTranslation();
	const [downloading, setDownloading] = useState(false);
	const [cardError, setCardError] = useState<string | null>(null);
	const cardRef = useRef<HTMLDivElement | null>(null);

	const sharedNames = birthdays
		.filter(
			(b) =>
				!isSameRecord(b, record) &&
				b.month === record.month &&
				b.day === record.day,
		)
		.map((b) => b.name);
	const sameNamedCount = getSameNamedRecords(birthdays, record).length;
	const duplicateCount = getDuplicateRecords(birthdays, record).length;

	const handleDownloadCard = async () => {
		const element = cardRef.current;
		if (!element) {
			setCardError(t("app.card_error"));
			return;
		}

		setCardError(null);
		setDownloading(true);
		try {
			const html2canvas = (await import("html2canvas")).default;
			const canvas = await html2canvas(element, {
				backgroundColor: null,
				scale: 2,
				logging: false,
			});
			const link = document.createElement("a");
			link.download = shareCardFileName(record.name);
			link.href = canvas.toDataURL("image/png");
			link.click();
			notify.success(`Downloaded birthday card for ${record.name}! 📸`);
		} catch (e) {
			console.error("Failed to generate card", e);
			const message = t("app.card_error");
			setCardError(message);
			notify.error(message);
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div style={{ padding: "8px 12px" }}>
			<Alert
				title={t("app.title")}
				icon={<span>🔮</span>}
				color="blue"
				variant="light"
				style={{ marginBottom: 12 }}
			>
				{t(`data.insights.${record.dailyInsight}`)}
			</Alert>

			<DetailsShareActions
				record={record}
				downloading={downloading}
				error={cardError}
				onDownload={handleDownloadCard}
			/>

			<OnThisDay month={record.month} day={record.day} />

			<DetailsEtymology record={record} />

			<DetailsInfoCards
				record={record}
				sharedNames={sharedNames}
				duplicateCount={duplicateCount}
				sameNamedCount={sameNamedCount}
			/>

			<div style={{ marginTop: 12 }}>
				<Suspense fallback={<div style={{ minHeight: 180 }} />}>
					<BiorhythmsChart birthday={record.birthday} />
				</Suspense>
			</div>

			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					left: "-9999px",
					top: 0,
					pointerEvents: "none",
				}}
			>
				<ShareCard ref={cardRef} record={record} />
			</div>
		</div>
	);
};
