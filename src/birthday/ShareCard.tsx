import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { getAgeEmoji } from "./birthdays";

export const SHARE_CARD_WIDTH = 600;
export const SHARE_CARD_HEIGHT = 900;

const INK = "#f6efe3";
const INK_MUTED = "rgba(246, 239, 227, 0.74)";
const INK_FAINT = "rgba(246, 239, 227, 0.56)";
const MAT = "#f2e9dc";

const ACCENTS: Record<
	Birthday["kind"],
	{ solid: string; onDark: string; wash: string }
> = {
	"💒": {
		solid: "#d8a24a",
		onDark: "#e8bf76",
		wash: "rgba(216, 162, 74, 0.16)",
	},
	"♂️": {
		solid: "#5b9bd5",
		onDark: "#8ec2ea",
		wash: "rgba(91, 155, 213, 0.16)",
	},
	"♀️": {
		solid: "#d4739f",
		onDark: "#e8a2c4",
		wash: "rgba(212, 115, 159, 0.16)",
	},
};

type TileProps = {
	glyph: string;
	value: string;
	label?: string;
	emphasis?: boolean;
};

const Tile = ({ glyph, value, label, emphasis }: TileProps) => (
	<div
		style={{
			flex: 1,
			minWidth: 0,
			padding: "12px 11px",
			background: "rgba(255, 255, 255, 0.07)",
			border: "1px solid rgba(255, 255, 255, 0.13)",
			borderRadius: 12,
			textAlign: "left",
		}}
	>
		{label && (
			<div
				style={{
					fontSize: 12,
					lineHeight: "14px",
					color: INK_FAINT,
					textTransform: "uppercase",
					letterSpacing: 1.2,
					marginBottom: 4,
				}}
			>
				{glyph} {label}
			</div>
		)}
		{!label && (
			<div style={{ fontSize: 20, lineHeight: "24px", marginBottom: 2 }}>
				{glyph}
			</div>
		)}
		<div
			style={{
				fontSize: emphasis ? 19 : 15,
				lineHeight: emphasis ? "24px" : "19px",
				fontWeight: 600,
				color: INK,
				overflowWrap: "break-word",
			}}
		>
			{value}
		</div>
	</div>
);

type ShareCardProps = {
	record: Birthday;
	ref?: Ref<HTMLDivElement>;
};

export const ShareCard = ({ record, ref }: ShareCardProps) => {
	const { t } = useTranslation();
	const accent = ACCENTS[record.kind];

	return (
		<div
			ref={ref}
			style={{
				width: `${SHARE_CARD_WIDTH}px`,
				height: `${SHARE_CARD_HEIGHT}px`,
				boxSizing: "border-box",
				padding: 8,
				background: MAT,
				borderRadius: 20,
				overflow: "hidden",
				fontFamily:
					'"Segoe UI", Roboto, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
			}}
		>
			<div
				style={{
					width: "100%",
					height: "100%",
					boxSizing: "border-box",
					borderRadius: 13,
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
					padding: "34px 40px 28px",
					color: INK,
					textAlign: "center",
					background:
						"linear-gradient(160deg, #1b2340 0%, #2a1c3d 52%, #431f36 100%)",
				}}
			>
				<div style={{ fontSize: 68, lineHeight: "104px" }}>
					{getAgeEmoji(record.age, record.kind)}
				</div>
				<div
					style={{
						marginTop: 14,
						fontSize: 13,
						lineHeight: "16px",
						fontWeight: 700,
						textTransform: "uppercase",
						letterSpacing: 3,
						color: accent.onDark,
					}}
				>
					{t("app.timeline.anniversary")}
				</div>
				<h1
					style={{
						margin: "10px 0 0",
						fontSize: 44,
						lineHeight: "58px",
						fontWeight: 700,
						color: INK,
						overflowWrap: "break-word",
					}}
				>
					{record.name}
				</h1>
				<div
					style={{
						margin: "20px auto 0",
						width: 120,
						height: 2,
						background: accent.solid,
					}}
				/>
				<div
					style={{
						marginTop: 12,
						fontSize: 22,
						lineHeight: "28px",
						fontWeight: 600,
						color: INK_MUTED,
					}}
				>
					{t("app.timeline.turns", { age: record.age + 1 })}
				</div>

				<div style={{ flex: 1, minHeight: 10 }} />

				<div
					style={{
						marginTop: 20,
						padding: "20px 22px",
						background: accent.wash,
						border: `1px solid ${accent.solid}`,
						borderRadius: 14,
						fontSize: 17,
						lineHeight: "25px",
						fontStyle: "italic",
						color: INK,
					}}
				>
					🔮 {t(`data.insights.${record.dailyInsight}`)}
				</div>

				<div style={{ flex: 1, minHeight: 10 }} />

				<div style={{ display: "flex", gap: 10 }}>
					<Tile
						glyph={record.signSymbol}
						value={t(`data.zodiac.${record.sign}`)}
					/>
					<Tile
						glyph={record.birthgemEmoji}
						value={t(`data.birthgems.${record.birthgem}`)}
					/>
					<Tile
						glyph="🐉"
						value={t(`data.chinese_zodiac.${record.chineseZodiac}`)}
					/>
					<Tile
						glyph={record.moonPhaseIcon}
						value={t(`data.moon_phases.${record.moonPhase}`)}
					/>
				</div>

				<div style={{ display: "flex", gap: 10, marginTop: 10 }}>
					<Tile
						emphasis
						glyph="🔢"
						label={t("units.path")}
						value={String(record.lifePathNumber)}
					/>
					<Tile
						emphasis
						glyph="🚀"
						label={t("units.km_orbit")}
						value={record.distanceTraveled.toLocaleString()}
					/>
					<Tile
						emphasis
						glyph="💓"
						label={t("units.beats")}
						value={record.heartbeats.toLocaleString()}
					/>
				</div>

				<div
					style={{
						marginTop: 22,
						height: 1,
						background: "rgba(246, 239, 227, 0.18)",
					}}
				/>
				<div
					style={{
						marginTop: 16,
						fontSize: 14,
						lineHeight: "20px",
						fontStyle: "italic",
						color: INK_MUTED,
					}}
				>
					{t(`data.life_path.${record.lifePathMeaning}`)}
					<br />
					{t(`data.zodiac_traits.${record.sign}`)}
				</div>

				<div
					style={{
						marginTop: 20,
						fontSize: 12,
						lineHeight: "16px",
						fontWeight: 600,
						letterSpacing: 2,
						textTransform: "uppercase",
						color: INK_FAINT,
					}}
				>
					{t("app.title")}
				</div>
			</div>
		</div>
	);
};

export { shareCardFileName } from "./share-card-file-name";
