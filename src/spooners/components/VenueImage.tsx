import { Box } from "@mantine/core";
import { Beer } from "lucide-react";
import { useState } from "react";

type Props = {
	src?: string | null;
	alt: string;
	width: number | string;
	height: number | string;
	radius?: number;
};

/** A pub photo that degrades to a small placeholder if it fails to load. */
export const VenueImage = ({ src, alt, width, height, radius = 6 }: Props) => {
	const [failed, setFailed] = useState(false);

	if (!src || failed) {
		return (
			<Box
				style={{
					width,
					height,
					borderRadius: radius,
					flexShrink: 0,
					background: "var(--mantine-color-default-hover)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: 14,
					opacity: 0.6,
				}}
			>
				<Beer size={16} />
			</Box>
		);
	}

	return (
		<Box
			component="img"
			src={src}
			alt={alt}
			loading="lazy"
			onError={() => setFailed(true)}
			style={{
				width,
				height,
				borderRadius: radius,
				flexShrink: 0,
				objectFit: "cover",
				display: "block",
			}}
		/>
	);
};
