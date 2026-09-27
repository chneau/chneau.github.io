import {
	ActionIcon,
	Badge,
	Button,
	Card,
	Code,
	Divider,
	Group,
	Loader,
	type MantineColorsTuple,
	MantineProvider,
	SimpleGrid,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import {
	Layers,
	Palette,
	RotateCcw,
	Search,
	Sparkles,
	SquareStack,
	Type,
	Zap,
} from "lucide-react";
import { useState } from "react";
import {
	AppHeader,
	AppSwitcher,
	BackHome,
	Brand,
	createAppTheme,
	EmptyState,
	Footer,
	Grain,
	HeaderAction,
	SchemeToggle,
	Section,
	Skeleton,
	Stat,
	StatusDot,
} from "../shared";

const brand: MantineColorsTuple = [
	"#eef2ff",
	"#e0e7ff",
	"#c7d2fe",
	"#a5b4fc",
	"#818cf8",
	"#6366f1",
	"#4f46e5",
	"#4338ca",
	"#3730a3",
	"#312e81",
];

const appTheme = createAppTheme({
	accent: brand,
	accentName: "brand",
	primaryShade: { light: 6, dark: 5 },
});

const COLORS = [
	["--app-bg", "app-bg"],
	["--app-bg-deep", "app-bg-deep"],
	["--app-surface", "app-surface"],
	["--app-surface-2", "app-surface-2"],
	["--app-surface-3", "app-surface-3"],
	["--app-border", "app-border"],
	["--app-text", "app-text"],
	["--app-text-muted", "app-text-muted"],
	["--app-text-faint", "app-text-faint"],
	["--app-danger", "app-danger"],
	["--app-warn", "app-warn"],
	["--mantine-primary-color-filled", "accent"],
] as const;

const Swatch = ({ name, value }: { name: string; value: string }) => (
	<Card withBorder padding="xs" radius="md">
		<div
			style={{
				height: 44,
				borderRadius: 8,
				background: value,
				border: "1px solid var(--app-border)",
			}}
		/>
		<Text size="xs" fw={600} mt={6}>
			{name}
		</Text>
		<Code>{value}</Code>
	</Card>
);

export const App = () => {
	const [dark, setDark] = useState(true);

	return (
		<MantineProvider
			theme={appTheme}
			forceColorScheme={dark ? "dark" : "light"}
		>
			<Stack
				gap={0}
				style={{ minHeight: "100dvh", background: "var(--app-bg)" }}
			>
				<AppHeader
					brand={
						<Brand
							href="/"
							icon={<Layers size={18} />}
							title="Design System"
							subtitle="Shared foundation"
						/>
					}
					actions={
						<>
							<AppSwitcher />
							<BackHome />
							<SchemeToggle
								dark={dark}
								onToggle={() => setDark((value) => !value)}
							/>
						</>
					}
				/>

				<main
					style={{
						flex: 1,
						width: "100%",
						maxWidth: 1080,
						margin: "0 auto",
						padding: "28px 20px 64px",
					}}
				>
					<Stack gap="lg">
						<div>
							<Title order={1}>Design System</Title>
							<Text c="dimmed">
								The tokens and primitives every app shares. Change the scheme
								with the toggle in the header.
							</Text>
						</div>

						<Section title="Colour tokens" badge={<Palette size={14} />}>
							<SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
								{COLORS.map(([variable, name]) => (
									<Swatch
										key={variable}
										name={name}
										value={`var(${variable})`}
									/>
								))}
							</SimpleGrid>
						</Section>

						<Section title="Typography" badge={<Type size={14} />}>
							<Stack gap="xs">
								<Title order={1}>Heading one</Title>
								<Title order={2}>Heading two</Title>
								<Title order={3}>Heading three</Title>
								<Text>Body text, the default reading size.</Text>
								<Text c="dimmed">Muted text for secondary detail.</Text>
								<Text className="app-num">00:00 · 1,234 · £12.50</Text>
							</Stack>
						</Section>

						<Section title="Controls" badge={<SquareStack size={14} />}>
							<Stack gap="md">
								<Group gap="sm" wrap="wrap">
									<HeaderAction
										iconOnly
										label="Icon only"
										icon={<Zap size={16} />}
									/>
									<HeaderAction label="With label" icon={<Zap size={16} />}>
										Action
									</HeaderAction>
									<HeaderAction
										accent
										label="Accent action"
										icon={<Zap size={16} />}
									>
										Primary
									</HeaderAction>
									<HeaderAction
										active
										label="Active action"
										icon={<Zap size={16} />}
									>
										Active
									</HeaderAction>
									<HeaderAction
										disabled
										label="Disabled action"
										icon={<Zap size={16} />}
									>
										Disabled
									</HeaderAction>
									<HeaderAction
										loading
										label="Loading action"
										icon={<Loader size={16} />}
									>
										Loading
									</HeaderAction>
								</Group>
								<Divider />
								<Group gap="sm" wrap="wrap">
									<Button>Filled</Button>
									<Button variant="light">Light</Button>
									<Button variant="default">Default</Button>
									<Button variant="subtle">Subtle</Button>
									<Button variant="outline">Outline</Button>
									<ActionIcon variant="default" size={36}>
										<Zap size={16} />
									</ActionIcon>
									<Badge variant="light">Badge</Badge>
									<Badge variant="outline" color="brand">
										Brand
									</Badge>
								</Group>
							</Stack>
						</Section>

						<Section
							title="Indicators"
							badge={<Sparkles size={14} />}
							actions={
								<Text size="xs" c="dimmed">
									status · skeleton · empty
								</Text>
							}
						>
							<Stack gap="md">
								<Group gap="lg">
									<Group gap="xs">
										<StatusDot />
										<Text size="sm">Online</Text>
									</Group>
									<Group gap="xs">
										<StatusDot on={false} />
										<Text size="sm">Offline</Text>
									</Group>
								</Group>
								<Stack gap={6}>
									<Skeleton width="60%" />
									<Skeleton width="40%" />
									<Skeleton width="80%" height={10} />
								</Stack>
								<EmptyState
									icon={<Search size={20} />}
									title="Nothing here yet"
									body="Empty states share the same mark, title, body and action."
									action={
										<Button
											variant="default"
											size="sm"
											leftSection={<RotateCcw size={14} />}
										>
											Reset
										</Button>
									}
								/>
							</Stack>
						</Section>

						<Section title="Data" badge={<SquareStack size={14} />}>
							<SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
								<Stat
									icon={<Zap size={13} />}
									label="Fastest"
									value="142 km/h"
									hint="average across the run"
								/>
								<Stat label="Longest" value="386 km" hint="end to end" />
								<Stat
									label="Most stops"
									value="24"
									hint="clickable"
									onClick={() => undefined}
								/>
							</SimpleGrid>
						</Section>

						<Card withBorder padding="lg" radius="md">
							<Title order={3} mb={6}>
								Chrome
							</Title>
							<Text c="dimmed" size="sm">
								Header, footer and grain are shared too. The footer is below.
							</Text>
						</Card>
					</Stack>
				</main>

				<Footer
					left="Design System · shared foundation"
					right={
						<Group gap="xs">
							<Badge variant="light" color="brand">
								primitives
							</Badge>
							<Badge variant="light">tokens</Badge>
						</Group>
					}
				/>
			</Stack>
			<Grain />
		</MantineProvider>
	);
};
