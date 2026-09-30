import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import type { Birthday } from "./birthdays";
import { getAgeEmoji } from "./birthdays";

/**
 * The share card is rasterised to PNG and pasted into a chat, so it is an
 * *image*, not a view of the app: it has to survive two backgrounds it does
 * not control (the page it was captured from, and the chat it lands in).
 *
 * ## Why this scheme is theme-independent
 *
 * A chat bubble runs from `#ffffff` (iMessage light, WhatsApp light) to
 * `#1a1a1a` (both dark). A card that is itself near-white disappears into the
 * light bubble; a card that is near-black disappears into the dark one. So the
 * card carries its own contrast at *both* ends:
 *
 * - an opaque deep gradient field (indigo -> plum), which separates the card
 *   from any light background by luminance;
 * - a cream 8px mat around it, which separates the card from any dark
 *   background by luminance.
 *
 * Between the two there is no chat background the card can blend into. It also
 * means nothing here reads `store.darkMode`: the exported PNG is byte-for-byte
 * the same whether the app was in light or dark mode, and so is the card's
 * relationship to the reader's chat theme.
 *
 * ## What html2canvas cannot do
 *
 * html2canvas only reimplements *painting* — layout still comes from the
 * browser — but it re-implements painting badly for a handful of properties.
 * The ones that produce a blank or mangled export are banned here:
 *
 * - `filter` / `backdrop-filter` (silently ignored, and a filtered ancestor
 *   can drop the subtree entirely);
 * - `color-mix()`, `oklch()`, `lab()` — its colour parser only understands
 *   hex, `rgb()`/`rgba()`, `hsl()`/`hsla()` and the CSS named colours, and
 *   throws on anything else;
 * - `conic-gradient` — unsupported (only `linear-gradient` and
 *   `radial-gradient` are in its gradient table);
 * - CSS custom properties — it reads `getComputedStyle`, so a `var()` resolves
 *   to whatever the *current theme* says, which is exactly the coupling this
 *   card is trying to escape. Every colour below is a literal hex or rgba.
 *
 * `linear-gradient` with an explicit angle, `box-shadow`, `text-shadow`,
 * `border-radius`, `letter-spacing`, `text-transform` and flex/grid layout are
 * all fine and are used below.
 *
 * No Mantine components either: their theming is driven by CSS variables and
 * data attributes, so importing them would reintroduce the theme coupling.
 */

/** Fixed portrait canvas. 2x scale on export gives a 1200x1800 PNG. */
export const SHARE_CARD_WIDTH = 600;
export const SHARE_CARD_HEIGHT = 900;

/**
 * Cream mat + warm off-white ink. Held as literals rather than theme tokens so
 * the capture never depends on `data-theme`.
 */
const INK = "#f6efe3";
const INK_MUTED = "rgba(246, 239, 227, 0.74)";
const INK_FAINT = "rgba(246, 239, 227, 0.56)";
const MAT = "#f2e9dc";

/**
 * Per-kind accent. `getKindColor()` returns *Mantine palette names*
 * ("gold"/"blue"/"magenta"), which happen to also be CSS colour keywords with
 * completely unrelated values (#ffd700, #0000ff, #ff00ff). The card needs real
 * hexes, so the mapping is spelled out here instead.
 *
 * `onDark` is the same hue lifted for text on the deep field, so the accent
 * stays legible against it.
 */
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

/**
 * A labelled tile. `label` is optional because the four trait tiles are
 * already named by their own value ("Aries", "Ruby") and only need a glyph,
 * whereas the scale tiles need a real caption ("Path", "km orbit").
 */
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
				// `break-word` rather than `anywhere`: a long number must be
				// allowed to wrap if a locale's digits are wider than expected,
				// but a name should only break when it truly cannot fit.
				overflowWrap: "break-word",
			}}
		>
			{value}
		</div>
	</div>
);

type ShareCardProps = {
	record: Birthday;
	/**
	 * The card's root node. The owner attaches it so `html2canvas` can
	 * rasterise the element directly — a ref rather than a `document.getElementById`
	 * lookup, which would have to encode the display name (spaces, accents,
	 * slashes, `&`) into an id.
	 */
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
				// Set explicitly rather than inherited: html2canvas copies the
				// capture iframe's computed font, and an inherited one would tie
				// the PNG to whatever the page had at capture time.
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
				{/* Identity: the reader should know whose card this is before
				    they read a single fact on it. */}
				<div style={{ fontSize: 68, lineHeight: "104px" }}>
					{getAgeEmoji(record.age, record.kind)}
				</div>
				<div
					style={{
						// Generous, because html2canvas paints glyphs on a bottom
						// baseline: emoji in particular hang below their DOM box and
						// collide with the line under them unless there is room.
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
						// A generous line box: html2canvas paints glyphs on a bottom
						// baseline, so a tight one lets the accent rule below cut
						// straight through the descenders.
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

				{/* Slack is split across the card rather than pooled in one place, so the
				    whitespace reads as deliberate breathing room instead of a hole.
				    These spacers are also what pin the card to exactly 600x900
				    however long the translated strings above and below get --
				    uncapped, they collapse to `minHeight` and let a long
				    translation push the content instead of overflowing. */}
				<div style={{ flex: 1, minHeight: 10 }} />

				{/* The insight is the one line of prose on the card, so it gets
				    its own panel rather than another grid tile. */}
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

				{/* Traits: what they are, four at a time. */}
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

				{/* Scale: the big numbers, which need a different weight to the
				    tiles above. */}
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

				{/* The closing prose, deliberately quiet. */}
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

/**
 * A safe filename for the `download` attribute.
 *
 * The display name is free text: it may hold spaces, accents, `&`, `/` or
 * parentheses, and browsers treat a `/` in a download name inconsistently at
 * best and as a path at worst. Diacritics are folded with NFD (so `Cécile`
 * becomes `Cecile` rather than losing its `e`), and everything outside
 * `[a-z0-9]` is dropped.
 */
export const shareCardFileName = (name: string): string => {
	const folded = name
		.normalize("NFD")
		// Combining marks left behind by the decomposition above.
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
	// A name of only accents/punctuation/symbols would otherwise yield an
	// empty stem.
	return folded.length > 0
		? `birthday-card-${folded}.png`
		: "birthday-card.png";
};
