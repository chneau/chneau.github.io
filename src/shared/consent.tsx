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

/** The i18n keys the consent UI owns; see NEW KEYS in the change report. */
type ConsentKey =
	| "consent.title"
	| "consent.body"
	| "consent.accept"
	| "consent.decline";

/**
 * `t` with a required `defaultValue`.
 *
 * `react-i18next` types `t` against the `en.json` resource tree (declared in
 * `src/birthday/i18next.d.ts`), so a key that has not landed in the locale files
 * yet is a compile error and renders as `unknown`. Widening just this component
 * to "key plus mandatory English default" keeps the call sites fully typed and
 * renders correct English text until the locale files gain `consent.*`.
 */
type Translate = (key: ConsentKey, options: { defaultValue: string }) => string;

const useConsentText = (): Translate => {
	const { t } = useTranslation();
	return t as unknown as Translate;
};

type ConsentState = {
	/** `true` only once the visitor has explicitly opted in. */
	granted: boolean;
	/** `true` until the visitor has answered the prompt either way. */
	undecided: boolean;
	/**
	 * `true` when the browser exports Do Not Track or Global Privacy Control.
	 * Those signals are an opt-out under ePrivacy art. 5(3) and CCPA/CPRA
	 * §702(g), so we never prompt and never initialise.
	 */
	forcedOff: boolean;
	/** Record a choice and apply it immediately. */
	decide: (granted: boolean) => void;
};

/**
 * Read the persisted decision and keep it in sync.
 *
 * The store is the source of truth, so this stays correct across the seven apps
 * that share `localStorage` on the same origin: accepting the banner on the root
 * app switches analytics on for `/cv/` and `/birthday/` too.
 */
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
		// GPC can be flipped by an extension after first paint.
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

/**
 * A one-line, dismissible privacy prompt.
 *
 * Deliberately a corner card rather than a modal: it must never block the page
 * it is asking about. It states exactly what would be collected and gives a real
 * "no" that is as easy to click as "yes".
 */
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
							{t("consent.accept", { defaultValue: "Allow" })}
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
