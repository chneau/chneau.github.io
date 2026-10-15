import { Button, Group, Paper, Text } from "@mantine/core";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	getAnalyticsConsent,
	hasAnalyticsConsent,
	hasDoNotTrack,
	onConsentChange,
	setAnalyticsConsent,
} from "./analytics";

type ConsentKey =
	| "consent.title"
	| "consent.body"
	| "consent.accept"
	| "consent.decline";

type Translate = (key: ConsentKey, options: { defaultValue: string }) => string;

const useConsentText = (): Translate => {
	const { t } = useTranslation();
	return t as unknown as Translate;
};

type ConsentState = {
	granted: boolean;
	undecided: boolean;
	forcedOff: boolean;
	decide: (granted: boolean) => void;
};

export const useAnalyticsConsent = (): ConsentState => {
	const [granted, setGranted] = useState(hasAnalyticsConsent);
	const [undecided, setUndecided] = useState(
		() => getAnalyticsConsent() === "unset",
	);
	const [forcedOff, setForcedOff] = useState(hasDoNotTrack);

	useEffect(
		() =>
			onConsentChange((next) => {
				setGranted(next);
				setUndecided(false);
			}),
		[],
	);

	useEffect(() => {
		const onChange = () => setForcedOff(hasDoNotTrack());
		window.addEventListener("change", onChange);
		return () => window.removeEventListener("change", onChange);
	}, []);

	const decide = useCallback((next: boolean) => {
		setAnalyticsConsent(next);
		setGranted(next);
		setUndecided(false);
	}, []);

	return { granted, undecided, forcedOff, decide };
};

export const ConsentBanner = () => {
	const t = useConsentText();
	const { undecided, forcedOff, decide } = useAnalyticsConsent();

	if (!undecided || forcedOff) return null;

	return (
		<Paper
			component="aside"
			className="app-consent"
			aria-label={t("consent.title", { defaultValue: "Analytics consent" })}
			shadow="md"
			radius="md"
			p="md"
			withBorder
		>
			<Group gap="sm" align="flex-start" wrap="nowrap">
				<ShieldCheck
					size={18}
					aria-hidden="true"
					style={{ flex: "none", marginTop: 2 }}
				/>
				<div className="app-consent__body">
					<Text size="sm" fw={600}>
						{t("consent.title", {
							defaultValue: "Anonymous usage stats?",
						})}
					</Text>
					<Text size="xs" c="dimmed">
						{t("consent.body", {
							defaultValue:
								"Count which apps are opened. No session replay, no autocapture, no cookies, no personal data. Decline and nothing is ever sent.",
						})}
					</Text>
					<Group gap="xs" mt="xs">
						<Button
							size="compact-xs"
							onClick={() => decide(true)}
							data-analytics-consent="accept"
						>
							{t("consent.accept", { defaultValue: "Allow analytics" })}
						</Button>
						<Button
							size="compact-xs"
							variant="subtle"
							color="gray"
							onClick={() => decide(false)}
							data-analytics-consent="decline"
						>
							{t("consent.decline", { defaultValue: "No thanks" })}
						</Button>
					</Group>
				</div>
			</Group>
		</Paper>
	);
};
