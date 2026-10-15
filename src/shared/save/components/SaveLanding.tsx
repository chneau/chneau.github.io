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
import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import type { SaveCodec } from "../types";

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
	children?: ReactNode;
}) => {
	const [dragging, setDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

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
						<LoadingState label={status || "Reading save"} hideLabel>
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
						</LoadingState>
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
							<input
								ref={fileInputRef}
								type="file"
								accept={codec.extensions.map((e) => `.${e}`).join(",")}
								style={{ display: "none" }}
								onChange={(event) => {
									take(event.target.files?.[0]);
									event.target.value = "";
								}}
							/>
							<Button mt="md" onClick={() => fileInputRef.current?.click()}>
								Choose save file
							</Button>
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
						<Title order={2} size="h5">
							How the format works
						</Title>
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
								<Title order={3} size="sm" fw={600}>
									{note.title}
								</Title>
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

export const SaveHero = ({ codec }: { codec: SaveCodec }) => (
	<Stack gap="lg" maw={620}>
		<Title order={1}>{codec.game} save editor</Title>
		<Text size="md" c="dimmed" lh={1.7}>
			Every byte is parsed in this tab, and anything you change is rebuilt and
			read back before you are offered the file. Nothing is uploaded.
		</Text>
		<Code>{codec.formatLabel}</Code>
	</Stack>
);
