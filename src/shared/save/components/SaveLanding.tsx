import {
	Alert,
	Box,
	Button,
	Code,
	Divider,
	Group,
	Skeleton,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import { FileUp, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { type DragEvent, type ReactNode, useState } from "react";
import type { SaveCodec } from "../types";

/**
 * The pre-load screen, shared by every save editor here.
 *
 * The argument for the tool sits beside the drop target rather than above it,
 * and the drop target is a single panel with a hairline edge rather than a
 * dashed placeholder — the affordance should read as a destination, not as a
 * form field awaiting input.
 *
 * The format notes are the other half of the page. A save editor is mostly a
 * story about a file format, and a user deciding whether to trust a tool that
 * is about to parse their save is really asking how the format works. So the
 * reverse engineering is given the same prominence as the button.
 */
export const SaveLanding = ({
	codec,
	loading,
	status,
	error,
	onSelectFile,
	children,
}: {
	codec: SaveCodec;
	loading: boolean;
	status: string;
	error: string;
	onSelectFile: (file: File) => void;
	/** A demo-sample loader, rendered under the drop target when supplied. */
	children?: ReactNode;
}) => {
	const [dragging, setDragging] = useState(false);

	const take = (file: File | undefined): void => {
		if (file) onSelectFile(file);
	};

	return (
		<Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
			<Box maw={1240} mx="auto" px="xl" py="xl">
				<Box
					onDragEnter={(event: DragEvent) => {
						event.preventDefault();
						setDragging(true);
					}}
					onDragOver={(event: DragEvent) => event.preventDefault()}
					onDragLeave={() => setDragging(false)}
					onDrop={(event: DragEvent) => {
						event.preventDefault();
						setDragging(false);
						take(event.dataTransfer.files[0]);
					}}
					aria-busy={loading}
					p="xl"
					style={{
						display: "grid",
						placeItems: "center",
						textAlign: "center",
						borderRadius: "var(--app-radius-lg)",
						border: `1px solid ${
							dragging
								? "var(--mantine-primary-color-filled)"
								: "var(--app-border)"
						}`,
						backgroundImage: dragging
							? "radial-gradient(120% 120% at 50% 0%, var(--app-accent-soft), transparent 60%)"
							: "radial-gradient(120% 120% at 50% 0%, var(--app-accent-soft), transparent 55%)",
						boxShadow: "inset 0 1px 0 var(--app-border), var(--app-shadow-md)",
						transition: "border-color 200ms var(--app-ease)",
					}}
				>
					{loading ? (
						<Stack w="100%" maw={320} gap="md" align="stretch">
							<Skeleton height={14} width="45%" radius="sm" />
							<Skeleton height={10} radius="sm" />
							<Skeleton height={10} width="82%" radius="sm" />
							<Skeleton height={10} width="64%" radius="sm" />
							<Divider my="xs" />
							<Text size="sm" fw={500}>
								{status || "Reading save"}
							</Text>
							<Text size="xs" c="dimmed">
								Reading happens on this device.
							</Text>
						</Stack>
					) : (
						<Stack align="center" gap="sm">
							<Box
								w={56}
								h={56}
								style={{
									display: "grid",
									placeItems: "center",
									borderRadius: "var(--app-radius-md)",
									border: "1px solid var(--app-accent-line)",
									background: "var(--app-accent-soft)",
									color: "var(--mantine-primary-color-filled)",
								}}
							>
								<FileUp size={22} strokeWidth={2} />
							</Box>
							<Text mt="sm" fw={600} size="md">
								Drop your {codec.game} save here
							</Text>
							<Text size="xs" c="dimmed">
								{codec.extensions.map((e) => `.${e}`).join(" · ")} · read
								entirely in this tab
							</Text>
							<label>
								<input
									type="file"
									accept={codec.extensions.map((e) => `.${e}`).join(",")}
									style={{ display: "none" }}
									onChange={(event) => {
										take(event.target.files?.[0]);
										// Reset so re-picking the same file fires `change` again
										// after an edit has been reverted.
										event.target.value = "";
									}}
								/>
								<Button component="span" mt="md">
									Choose save file
								</Button>
							</label>
						</Stack>
					)}
				</Box>

				{children}

				<Group gap={6} wrap="nowrap" align="flex-start" px={4} mt="md">
					<LockKeyhole
						size={13}
						color="var(--app-text-muted)"
						style={{ flexShrink: 0, marginTop: 2 }}
					/>
					<Text size="xs" c="dimmed">
						Found at:{" "}
						<Text span ff="monospace" size="xs">
							{codec.defaultPath}
						</Text>
					</Text>
				</Group>

				{error ? (
					<Alert
						color="red"
						variant="light"
						icon={<TriangleAlert size={16} strokeWidth={2} />}
						title="Could not read that save"
						mt="md"
					>
						{error}
					</Alert>
				) : null}
			</Box>

			<Box
				style={{
					borderTop: "1px solid var(--app-border)",
					background: "var(--app-surface)",
				}}
			>
				<Box maw={1240} mx="auto" px="xl" py="xl">
					<Group gap={6} mb="lg">
						<ShieldCheck size={15} color="var(--app-text-muted)" />
						<Text
							size="11px"
							c="dimmed"
							tt="uppercase"
							fw={600}
							style={{ letterSpacing: "0.2em" }}
						>
							How {codec.formatLabel} works
						</Text>
					</Group>
					<Box
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
							gap: "var(--app-radius-lg)",
						}}
					>
						{codec.notes.map((note) => (
							<Stack key={note.title} gap={6}>
								<Text size="sm" fw={600}>
									{note.title}
								</Text>
								<Text size="sm" c="dimmed" lh={1.65}>
									{note.body}
								</Text>
							</Stack>
						))}
					</Box>
				</Box>
			</Box>
		</Box>
	);
};

/** The page heading, shown above the landing drop target. */
export const SaveHero = ({ codec }: { codec: SaveCodec }) => (
	<Stack gap="lg" maw={620}>
		<Text
			size="11px"
			c="dimmed"
			tt="uppercase"
			fw={600}
			style={{ letterSpacing: "0.2em" }}
		>
			{codec.game} · on-device save editor
		</Text>
		<Title order={1}>Read the format. Change the save. Keep it local.</Title>
		<Text size="md" c="dimmed" lh={1.7}>
			Every byte is parsed in this tab by a decoder written for the purpose, and
			anything you change is rebuilt and read back before you are offered the
			file. Nothing is uploaded.
		</Text>
		<Code>{codec.formatLabel}</Code>
	</Stack>
);
