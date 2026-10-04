import {
	Badge,
	Button,
	Card,
	Code,
	Group,
	Stack,
	Text,
	Title,
	UnstyledButton,
} from "@mantine/core";
import { AlertTriangle, Ruler, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { type Finding, GROUP_LABEL, GROUP_ORDER } from "./audit";
import type { TokenDef, TokenLayers } from "./tokens";

export const CopyableCode = ({
	value,
	label,
}: {
	value: string;
	label: string;
}) => {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timeout = window.setTimeout(() => setCopied(false), 1400);
		return () => window.clearTimeout(timeout);
	}, [copied]);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
		} catch {
			// Clipboard access can be denied; leave the label unchanged.
		}
	};

	return (
		<Group gap={6} wrap="nowrap" align="center">
			<UnstyledButton
				onClick={copy}
				title={`Copy ${value}`}
				aria-label={`Copy ${label} token`}
			>
				<Code>{value}</Code>
			</UnstyledButton>
			<Text span size="xs" fw={600} c="brand" aria-live="polite">
				{copied ? "Copied" : ""}
			</Text>
		</Group>
	);
};

/** Visually hidden heading so each card still contributes to the outline. */
export const SectionHeading = ({ children }: { children: string }) => (
	<Title order={2} className="sr-only">
		{children}
	</Title>
);

/**
 * Token sync state, drawn with the shared tokens rather than a Mantine `Badge`.
 *
 * `variant="light"` paints its label in the colour's `-light-color` step on a
 * 10%-tinted background, which lands around 3.8:1 at badge size — under the
 * 4.5:1 that small text needs. A dot plus body-text colour says the same thing
 * and passes, which is the point of a gallery.
 */
const DriftBadge = ({
	declared,
	live,
}: {
	declared: string | undefined;
	live: string | undefined;
}) => {
	if (!declared || !live) {
		return (
			<Text size="xs" c="var(--app-text-muted)">
				—
			</Text>
		);
	}
	const drift = declared !== live;
	return (
		<span className="design-audit__kind design-audit__kind--pass">
			<span
				aria-hidden="true"
				style={{
					display: "inline-block",
					width: 6,
					height: 6,
					borderRadius: "var(--app-radius-pill)",
					background: drift ? "var(--app-danger)" : "var(--app-accent)",
				}}
			/>
			{drift ? " drift" : " in sync"}
		</span>
	);
};

export const TokenValue = ({ children }: { children: string | undefined }) => (
	<Text
		size="xs"
		c="var(--app-text-muted)"
		className="app-num"
		style={{ wordBreak: "break-word" }}
	>
		{children ?? "—"}
	</Text>
);

export const ColourCard = ({
	token,
	layers,
	live,
	scheme,
}: {
	token: TokenDef;
	layers: TokenLayers;
	live: Record<string, string>;
	scheme: "light" | "dark";
}) => {
	const light = layers.light[token.name];
	const dark = layers.dark[token.name];
	const current = scheme === "dark" ? dark : light;

	return (
		<Card withBorder padding="xs" radius="md">
			<div className="design-swatch-pair">
				<div
					className="design-swatch"
					title={`${token.label} — light`}
					style={{ background: light ?? `var(${token.name})` }}
				/>
				<div
					className="design-swatch"
					title={`${token.label} — dark`}
					style={{ background: dark ?? `var(${token.name})` }}
				/>
			</div>
			<Group justify="space-between" gap={6} wrap="nowrap" mt={6}>
				<Text size="xs" fw={600} truncate>
					{token.label}
				</Text>
				<DriftBadge declared={current} live={live[token.name]} />
			</Group>
			<CopyableCode value={`var(${token.name})`} label={token.label} />
			<TokenValue>{`${light ?? "—"} · ${dark ?? "—"}`}</TokenValue>
		</Card>
	);
};

export const AccentCard = ({
	name,
	label,
	live,
	required,
}: {
	name: string;
	label: string;
	live: Record<string, string>;
	required: boolean;
}) => (
	<Card withBorder padding="xs" radius="md">
		<div
			className="design-swatch--accent"
			style={{ background: `var(${name})` }}
		/>
		<Group justify="space-between" gap={6} wrap="nowrap" mt={6}>
			<Text size="xs" fw={600} truncate>
				{label}
			</Text>
			{required ? (
				<Badge size="xs" variant="outline" color="brand">
					required
				</Badge>
			) : null}
		</Group>
		<CopyableCode value={`var(${name})`} label={label} />
		<TokenValue>
			{live[name] === undefined || live[name] === ""
				? "not defined — falls through to --mantine-primary-color-*"
				: live[name]}
		</TokenValue>
	</Card>
);

export const RadiusCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => (
	<Card withBorder padding="xs" radius="md">
		<div
			className="design-swatch--radius"
			style={{ borderRadius: `var(${token.name})` }}
		/>
		<Text size="xs" fw={600} mt={6}>
			{token.label}
		</Text>
		<CopyableCode value={`var(${token.name})`} label={token.label} />
		<TokenValue>{live[token.name]}</TokenValue>
	</Card>
);

export const ShadowCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => (
	<Card withBorder padding="xs" radius="md">
		<div
			className="design-swatch--shadow"
			style={{ boxShadow: `var(${token.name})` }}
		/>
		<Text size="xs" fw={600} mt={6}>
			{token.label}
		</Text>
		<CopyableCode value={`var(${token.name})`} label={token.label} />
		<TokenValue>{live[token.name]}</TokenValue>
	</Card>
);

export const FontCard = ({
	token,
	live,
}: {
	token: TokenDef;
	live: Record<string, string>;
}) => {
	const mono = token.name.includes("mono");
	return (
		<Card withBorder padding="sm" radius="md">
			<Text
				style={{
					fontFamily: `var(${token.name})`,
					fontSize: mono ? 14 : 18,
				}}
			>
				{mono ? "00:00 · £12.50 · 1,234" : "Grumpy wizards make toxic brew"}
			</Text>
			<Group justify="space-between" mt={6} gap={6} wrap="nowrap">
				<Text size="xs" fw={600}>
					{token.label}
				</Text>
				<CopyableCode value={`var(${token.name})`} label={token.label} />
			</Group>
			<TokenValue>{live[token.name]}</TokenValue>
		</Card>
	);
};

export const AuditPanel = ({
	findings,
	pending,
	schemeWord,
}: {
	findings: readonly Finding[];
	pending: boolean;
	schemeWord: "light" | "dark";
}) => {
	const failures = findings.filter((finding) => finding.level === "fail");
	const [open, setOpen] = useState(false);

	return (
		<div className="design-audit" data-design-audit="">
			<Group gap="sm" align="center" wrap="wrap">
				{pending ? (
					<Badge variant="light" color="gray" leftSection={<Ruler size={12} />}>
						measuring the {schemeWord} scheme
					</Badge>
				) : failures.length === 0 ? (
					<Badge
						variant="light"
						color="brand"
						leftSection={<ShieldCheck size={12} />}
					>
						all {findings.length} checks pass
					</Badge>
				) : (
					<Badge
						variant="light"
						color="red"
						leftSection={<AlertTriangle size={12} />}
					>
						{failures.length} of {findings.length} checks fail
					</Badge>
				)}
				<Button
					size="compact-sm"
					variant="default"
					disabled={pending}
					onClick={() => setOpen((value) => !value)}
					aria-expanded={open}
				>
					{open ? "Hide" : "Show"} report
				</Button>
			</Group>

			{open && !pending ? (
				<Stack gap="xs">
					{GROUP_ORDER.map((group) => {
						const rows = findings.filter((finding) => finding.group === group);
						if (rows.length === 0) return null;
						const groupFailures = rows.filter(
							(finding) => finding.level === "fail",
						).length;
						return (
							<details
								key={group}
								className="design-audit__group"
								open={groupFailures > 0}
							>
								<summary>
									{GROUP_LABEL[group]}
									<Badge
										size="xs"
										variant="outline"
										color={groupFailures > 0 ? "red" : "brand"}
									>
										{groupFailures > 0
											? `${groupFailures} failing`
											: `${rows.length} passing`}
									</Badge>
								</summary>
								<div className="design-audit__rows">
									{rows.map((finding) => (
										<div key={finding.id} className="design-audit__row">
											<span
												className={`design-audit__kind design-audit__kind--${finding.level}`}
											>
												{finding.level}
											</span>
											<span className="design-audit__subject">
												{finding.subject}
												{finding.level === "fail" && finding.shared ? (
													<Badge size="xs" variant="outline" color="red" ml={6}>
														shared layer
													</Badge>
												) : null}
											</span>
											<span className="design-audit__detail">
												{finding.detail}
											</span>
										</div>
									))}
								</div>
							</details>
						);
					})}
				</Stack>
			) : null}
		</div>
	);
};
