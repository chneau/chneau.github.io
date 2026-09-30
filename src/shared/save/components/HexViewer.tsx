import { Box, Group, ScrollArea, Text } from "@mantine/core";
import { useMemo } from "react";
import { type HexRow, toHexRows } from "../bytes";
import { formatBytes } from "../file";

/**
 * The bytes as they arrived, or as they will be handed back.
 *
 * Included because a save editor should not ask to be believed: when a rebuilt
 * file will not load, the first question is always "what actually changed",
 * and the answer is in the bytes. The view is a window rather than the whole
 * file — a save is frequently megabytes, and rendering all of it would stall
 * the tab for a view nobody scrolls to the end of.
 */
export const HexViewer = ({
	bytes,
	limit = 4096,
}: {
	bytes: Uint8Array;
	limit?: number;
}) => {
	const rows = useMemo(() => toHexRows(bytes, 16, limit), [bytes, limit]);
	const truncated = bytes.length > limit;

	return (
		<Box>
			<Group justify="space-between" mb="xs">
				<Text size="xs" c="dimmed">
					{formatBytes(bytes.length)}
					{truncated ? ` · showing the first ${formatBytes(limit)}` : ""}
				</Text>
			</Group>
			<ScrollArea style={{ height: "100%" }} type="auto">
				<Box
					component="pre"
					ff="monospace"
					fz={11}
					mih={0}
					pb="md"
					style={{ margin: 0, lineHeight: 1.55 }}
				>
					{rows.map((row: HexRow) => (
						<div key={row.offset}>
							<span style={{ color: "var(--app-text-faint)" }}>
								{row.offset.toString(16).padStart(6, "0")}
							</span>
							{"  "}
							{row.hex.map((byte, index) => (
								<span key={`${row.offset}-${index}`}>
									<span
										style={{
											color:
												byte === "00"
													? "var(--app-text-faint)"
													: "var(--app-text-muted)",
										}}
									>
										{byte}
									</span>{" "}
								</span>
							))}{" "}
							<span style={{ color: "var(--mantine-primary-color-filled)" }}>
								{row.ascii}
							</span>
						</div>
					))}
				</Box>
			</ScrollArea>
		</Box>
	);
};
