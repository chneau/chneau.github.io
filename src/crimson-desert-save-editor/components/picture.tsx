import { Box } from "@mantine/core";
import { Package, PawPrint } from "lucide-react";
import { useState } from "react";
import { useImage } from "../lib/image-archive";
import { type PictureKind, picturePath, pictureTable } from "./picture-path";

type PictureKindInfo = {
	pictures: Record<string, string>;
	fallback: typeof Package;
	size: number;
	intrinsic: number;
	missing: string | undefined;
	padding: number;
	opacity: number;
	fallbackSize: (size: number) => number;
};

const KINDS: Record<PictureKind, PictureKindInfo> = {
	item: {
		pictures: pictureTable("item"),
		fallback: Package,
		size: 40,
		intrinsic: 100,
		missing: "No picture available",
		padding: 2,
		opacity: 0.5,
		fallbackSize: (size) => Math.max(14, Math.round(size / 2)),
	},
	companion: {
		pictures: pictureTable("companion"),
		fallback: PawPrint,
		size: 56,
		intrinsic: 160,
		missing: undefined,
		padding: 0,
		opacity: 1,
		fallbackSize: (size) => Math.max(16, Math.round(size / 3)),
	},
};

const FRAME = {
	display: "inline-flex",
	alignItems: "center",
	justifyContent: "center",
	flexShrink: 0,
	overflow: "hidden",
	border: "1px solid var(--mantine-color-default-border)",
	borderRadius: "var(--mantine-radius-sm)",
	background: "var(--app-surface-2)",
	color: "var(--mantine-color-dimmed)",
	colorScheme: "only light",
} as const;

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
