import {
	Alert,
	Box,
	Button,
	Center,
	Code,
	Divider,
	Grid,
	Group,
	Skeleton,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import {
	Cpu,
	FileUp,
	HardDrive,
	LockKeyhole,
	ShieldCheck,
	TriangleAlert,
} from "lucide-react";
import { type DragEvent, useState } from "react";

/**
 * The pre-load screen. It is deliberately asymmetric: the argument for the tool
 * sits left of the drop target rather than centred over it, and the drop target
 * is a single panel with a hairline edge instead of a dashed placeholder box.
 *
 * The drag state is local because nothing outside this screen observes it.
 */
export const LandingView = ({
	loading,
	status,
	error,
	onOpenFile,
	onSelectFile,
}: {
	loading: boolean;
	status: string;
	error: string;
	onOpenFile: () => void;
	onSelectFile: (file: File) => void;
}) => {
	const [dragging, setDragging] = useState(false);

	const facts = [
		{ Icon: ShieldCheck, label: "No upload, no account" },
		{ Icon: Cpu, label: "Rebuilt in this tab" },
		{ Icon: HardDrive, label: "Original left untouched" },
	];

	return (
		<Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
			<Box maw={1240} mx="auto" px="xl" py="xl">
				<Grid gap="xl" align="center">
					<Grid.Col span={{ base: 12, lg: 7 }}>
						<Stack gap="lg" maw={560}>
							<Group gap="xs" wrap="nowrap">
								<Box
									w={6}
									h={6}
									style={{
										borderRadius: 999,
										background: "var(--mantine-primary-color-filled)",
									}}
								/>
								<Text
									size="11px"
									c="dimmed"
									tt="uppercase"
									fw={600}
									style={{ letterSpacing: "0.2em" }}
								>
									Crimson Desert · on-device save editor
								</Text>
							</Group>

							<Title order={1} maw={620}>
								Change your save without sending it anywhere.
							</Title>

							<Text size="md" c="dimmed" lh={1.7} maw="58ch">
								The editor reads your <Code>save.save</Code> in this tab, folds
								in the changes you stage, and returns a rebuilt file. Nothing is
								uploaded and the original is never overwritten.
							</Text>

							<Box
								component="ol"
								m={0}
								p={0}
								style={{
									listStyle: "none",
									borderTop: "1px solid var(--app-border)",
								}}
							>
								{[
									"Keep a backup, then open a copy of your save file.",
									"Pick a section in the rail and stage the changes.",
									"Download the rebuilt file into your game save folder.",
								].map((step, index) => (
									<Group
										key={step}
										align="flex-start"
										gap="md"
										wrap="nowrap"
										py="sm"
										style={{
											borderBottom: "1px solid var(--app-border)",
										}}
									>
										<Text
											ff="monospace"
											size="sm"
											fw={500}
											w={28}
											style={{ color: "var(--mantine-primary-color-filled)" }}
										>
											{String(index + 1).padStart(2, "0")}
										</Text>
										<Text size="sm" c="dimmed" lh={1.6}>
											{step}
										</Text>
									</Group>
								))}
							</Box>

							<Group gap="lg" mt="xs">
								{facts.map(({ Icon, label }) => (
									<Group key={label} gap={6} wrap="nowrap">
										<Icon
											size={15}
											color="var(--app-text-muted)"
											strokeWidth={2}
										/>
										<Text size="xs" c="dimmed">
											{label}
										</Text>
									</Group>
								))}
							</Group>
						</Stack>
					</Grid.Col>

					<Grid.Col span={{ base: 12, lg: 5 }}>
						<Stack gap="md">
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
									const file = event.dataTransfer.files[0];
									if (file) onSelectFile(file);
								}}
								aria-busy={loading}
								p="xl"
								style={{
									minHeight: 340,
									display: "grid",
									placeItems: "center",
									textAlign: "center",
									borderRadius: "var(--mantine-radius-lg)",
									border: `1px solid ${
										dragging
											? "var(--mantine-primary-color-filled)"
											: "var(--app-border)"
									}`,
									backgroundImage: dragging
										? "radial-gradient(120% 120% at 50% 0%, rgba(157, 80, 98, 0.16), transparent 60%)"
										: "radial-gradient(120% 120% at 50% 0%, rgba(157, 80, 98, 0.08), transparent 55%)",
									boxShadow:
										"inset 0 1px 0 var(--app-border), var(--mantine-shadow-md)",
									transition:
										"border-color 200ms ease, background-color 200ms ease",
								}}
							>
								{loading ? (
									<Stack w="100%" maw={320} gap="md" align="stretch">
										<Skeleton height={14} width="45%" radius="sm" />
										<Skeleton height={10} radius="sm" />
										<Skeleton height={10} radius="sm" width="82%" />
										<Skeleton height={10} radius="sm" width="64%" />
										<Divider my="xs" />
										<Text size="sm" fw={500}>
											{status || "Reading save"}
										</Text>
										<Text size="xs" c="dimmed">
											Reading and verifying happens on this device.
										</Text>
									</Stack>
								) : (
									<Stack align="center" gap="sm">
										<Center
											w={56}
											h={56}
											style={{
												borderRadius: "var(--mantine-radius-md)",
												border: "1px solid rgba(157, 80, 98, 0.5)",
												background: "rgba(157, 80, 98, 0.12)",
												color: "var(--mantine-primary-color-filled)",
											}}
										>
											<FileUp size={22} strokeWidth={2} />
										</Center>
										<Text mt="sm" fw={600} size="md">
											Drop a .save file here
										</Text>
										<Text size="xs" c="dimmed">
											or choose one from your computer
										</Text>
										<Button mt="md" onClick={onOpenFile}>
											Choose save file
										</Button>
									</Stack>
								)}
							</Box>

							<Group
								gap={6}
								wrap="nowrap"
								align="flex-start"
								px={4}
								opacity={0.85}
							>
								<LockKeyhole
									size={13}
									color="var(--app-text-muted)"
									style={{ flexShrink: 0, marginTop: 2 }}
								/>
								<Text size="xs" c="dimmed">
									Windows default path:{" "}
									<Text span ff="monospace" size="xs">
										%LOCALAPPDATA%\CrimsonDesert\Saved\SaveGames\
									</Text>
								</Text>
							</Group>

							{error && (
								<Alert
									color="red"
									variant="light"
									icon={<TriangleAlert size={16} strokeWidth={2} />}
									title="Could not open save"
								>
									{error}
								</Alert>
							)}
						</Stack>
					</Grid.Col>
				</Grid>
			</Box>
		</Box>
	);
};
