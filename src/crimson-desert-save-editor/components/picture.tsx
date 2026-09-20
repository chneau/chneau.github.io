import { Box } from "@mantine/core";
import { Package, PawPrint } from "lucide-react";
import { useState } from "react";
import companionPaths from "@/lib/generated/companion-image-paths.json";
import itemPaths from "@/lib/generated/item-image-paths.json";
import { useImage } from "@/lib/image-archive";

/**
 * One picture out of the shipped archives, or its kind's fallback glyph.
 *
 * The two kinds — an Item and a Companion — are the same picture with different
 * data, so the chrome, the failure state and the lookup live here once and the
 * kinds differ only by the table below. Pictures are decorative: the name beside
 * one is the accessible label, so the frame is `aria-hidden` and the image has
 * an empty `alt`.
 */

/** Which generated picture table a key is filed under. */
export type PictureKind = "item" | "companion";

type PictureKindInfo = {
	/** The published path table, keyed by the Item Key or Character Key. */
	pictures: Record<string, string>;
	/** Drawn in place of a picture the archive does not hold. */
	fallback: typeof Package;
	/** Frame size when the caller does not ask for one. */
	size: number;
	/** The `width`/`height` hint the artwork is published at. */
	intrinsic: number;
	/** Tooltip on a missing or broken picture; `undefined` says nothing. */
	missing: string | undefined;
	/** Inset, for artwork that should not touch the frame's edge. */
	padding: number;
	/** Opacity of the fallback glyph. */
	opacity: number;
	fallbackSize: (size: number) => number;
};

const KINDS: Record<PictureKind, PictureKindInfo> = {
	item: {
		pictures: itemPaths,
		fallback: Package,
		size: 40,
		intrinsic: 100,
		missing: "No picture available",
		padding: 2,
		opacity: 0.5,
		fallbackSize: (size) => Math.max(14, Math.round(size / 2)),
	},
	companion: {
		pictures: companionPaths,
		fallback: PawPrint,
		size: 56,
		intrinsic: 160,
		missing: undefined,
		padding: 0,
		opacity: 1,
		fallbackSize: (size) => Math.max(16, Math.round(size / 3)),
	},
};

/** Shared by both kinds: a square frame that centres whatever it holds. */
const FRAME = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	flexShrink: 0,
	overflow: "hidden",
	border: "1px solid var(--mantine-color-default-border)",
	borderRadius: "var(--mantine-radius-sm)",
	background: "rgba(0, 0, 0, 0.15)",
	color: "var(--mantine-color-dimmed)",
	// Keep automatic browser darkening from treating dark artwork as monochrome UI icons.
	colorScheme: "only light",
} as const;

/**
 * The published path one key is filed under, or `undefined` for a key the
 * table does not carry. Exported because it is the half of this module that can
 * be checked without a DOM: `tests/pictures.test.ts` holds it against the
 * committed archives.
 */
export const picturePath = (
	kind: PictureKind,
	key: number | string,
): string | undefined => KINDS[kind].pictures[String(key)];

export const Picture = ({
	kind,
	pictureKey,
	size,
}: {
	kind: PictureKind;
	pictureKey: number | string;
	size?: number;
}) => {
	const info = KINDS[kind];
	const frame = size ?? info.size;
	const picture = picturePath(kind, pictureKey);
	const source = useImage(picture);
	const [failedSource, setFailedSource] = useState<string>();
	const available = source !== undefined && source !== failedSource;
	/** Nothing will arrive: the table has no path, or the picture failed. */
	const broken = picture === undefined || failedSource !== undefined;
	const Fallback = info.fallback;
	return (
		<Box
			aria-hidden="true"
			title={broken ? info.missing : undefined}
			style={{ ...FRAME, width: frame, height: frame }}
		>
			{available ? (
				<img
					key={source}
					src={source}
					alt=""
					width={info.intrinsic}
					height={info.intrinsic}
					loading="lazy"
					decoding="async"
					onError={() => setFailedSource(source)}
					style={{
						width: "100%",
						height: "100%",
						objectFit: "contain",
						padding: info.padding,
					}}
				/>
			) : broken ? (
				<Fallback size={info.fallbackSize(frame)} opacity={info.opacity} />
			) : null}
		</Box>
	);
};
