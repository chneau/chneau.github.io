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
	// Inline as well as in a toast: a rasterise that fails after a few hundred
	// milliseconds is easy to miss as a transient notification, and the click
	// that caused it looks like a dead click without one.
	const [cardError, setCardError] = useState<string | null>(null);
	// A ref beats `getElementById(\`card-${record.name}\`)`: the name is free
	// text and would have to survive being an id, and it is not unique enough
	// to rely on across rows.
	const cardRef = useRef<HTMLDivElement | null>(null);

	// The four sets the info cards each read: who else is born on this day,
	// who else carries this name, and which rows are indistinguishable from
	// this one. They are computed here because they are all passes over the
	// whole list, and the row owns when they happen.
	const sharedNames = birthdays
		.filter(
			(b) =>
				!isSameRecord(b, record) &&
				b.month === record.month &&
				b.day === record.day,
		)
		.map((b) => b.name);
	// Same-named rows are scored independently on their own element, so the
	// "compatible" badges are not a claim about those people. A row that
	// is duplicated outright cannot be told from its twin at all, and must not
	// be presented as matching.
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
				// The card paints its own opaque background (see ShareCard), so
				// there is nothing for html2canvas to fill in behind it — and
				// nothing that could tie the export to the current theme.
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

			{/* Biorhythms Visual Chart */}
			<div style={{ marginTop: 12 }}>
				<Suspense fallback={<div style={{ minHeight: 180 }} />}>
					<BiorhythmsChart birthday={record.birthday} />
				</Suspense>
			</div>

			{/*
			 * Offscreen purely so html2canvas has a laid-out node to
			 * rasterise. It must stay *rendered* rather than `display: none`
			 * or `visibility: hidden`: html2canvas skips anything whose
			 * computed display/opacity/visibility says it is not painted, so
			 * either would hand back an empty PNG.
			 *
			 * `aria-hidden` because it is a duplicate of content already on the
			 * page, and screen readers should not meet it twice.
			 */}
			<div
				aria-hidden="true"
				style={{
					position: "absolute",
					left: "-9999px",
					top: 0,
					// Belt and braces: the node is off-canvas, but a stray
					// pointer event on it would be invisible and unreachable.
					pointerEvents: "none",
				}}
			>
				<ShareCard ref={cardRef} record={record} />
			</div>
		</div>
	);
};
