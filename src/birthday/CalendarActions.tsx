import { Menu, ScrollArea } from "@mantine/core";
import {
	CalendarDays,
	Download,
	Info,
	Link as LinkIcon,
	UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	getRawBirthdays,
	type RawBirthday,
	subscribeBirthdays,
} from "./birthdays";
import { generateIcs, type IcsRecord, icsFileName } from "./ics";
import { notify } from "./notify";

/**
 * The URL of the file this app PUBLISHES at build time.
 *
 * It is addressed at the site ROOT, not under `/birthday/`. The birthday
 * environment's `distPath.root` is `dist/birthday`, so deriving the URL from
 * `location.pathname` yields `https://host/birthday/birthdays.ics`, which is
 * not where the file is canonically published: `public/birthdays.ics` is
 * emitted to the site root by `_genIcs.ts` and the root environment's build.
 * In development the SPA history fallback answers that path with
 * `index.html` and a 200, so "Download .ics" quietly saves an HTML page
 * instead of a calendar -- a failure the status code hides completely.
 *
 * The origin is a parameter so this is testable without a DOM, and so all
 * three hosted actions provably agree on one URL.
 */
export const hostedIcsUrl = (origin: string): string =>
	new URL("/birthdays.ics", origin).href;

/**
 * `webcal` is NOT a "special" scheme in the WHATWG URL spec, so assigning it to
 * `URL.protocol` is silently ignored and the URL stays `https:`. The scheme
 * substitution has to happen textually on the href.
 */
export const toWebcal = (httpsUrl: string): string =>
	httpsUrl.replace(/^https:/i, "webcal:");

/**
 * Hand a generated file to the browser as a download.
 *
 * The object URL is created, clicked and revoked. An object URL pins its Blob
 * in memory until it is revoked, so leaking one per export grows without bound
 * in a long-lived tab. The revoke is deferred by a tick because some browsers
 * resolve the `download` navigation asynchronously and cancelling the URL
 * mid-flight aborts the save.
 */
const downloadText = (content: string, fileName: string) => {
	const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.rel = "noopener";
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 0);
};

/**
 * The `.ics` for a set of the user's OWN records.
 *
 * This is the point of the whole file: the hosted calendar is frozen at the
 * last build and cannot know about anything added, edited or deleted in the
 * app, so an export has to be generated here to be correct. It goes through
 * the same generator as the build-time script, so the two agree.
 */
const buildIcs = (
	records: readonly RawBirthday[],
	summary: (record: IcsRecord) => string,
	calendarName: string,
): string =>
	generateIcs(records, {
		summary,
		calendarName,
		// A fresh timestamp per export: DTSTAMP marks when this revision was
		// produced, and a stale one makes a subscriber ignore it.
		now: new Date(),
	});

export const CalendarActions = () => {
	const { t } = useTranslation();

	// The add / edit / delete flow writes straight to localStorage and fires
	// `subscribeBirthdays`, so the list is re-read on that signal rather than
	// snapshotted once: a stale list here is exactly the bug this file exists
	// to fix.
	const [records, setRecords] = useState<readonly RawBirthday[]>(() =>
		getRawBirthdays(),
	);
	useEffect(() => {
		const unsubscribe = subscribeBirthdays(() => setRecords(getRawBirthdays()));
		return () => {
			unsubscribe();
		};
	}, []);

	const summaryFor = (record: IcsRecord): string =>
		record.kind === "💒"
			? t("app.calendar.ics_wedding", { name: record.name })
			: t("app.calendar.ics_birthday", { name: record.name });

	const downloadAll = () => {
		downloadText(
			buildIcs(records, summaryFor, t("app.calendar.calendar_name")),
			"birthdays.ics",
		);
		notify.success(t("app.calendar.exported"));
	};

	const downloadOne = (record: RawBirthday) => {
		downloadText(
			// The same generator over one person, so a shared family calendar
			// can carry a single person without diverging from the full file.
			buildIcs([record], summaryFor, record.name),
			icsFileName(record.name),
		);
	};

	const subscribeICS = () => {
		window.location.assign(toWebcal(hostedIcsUrl(window.location.origin)));
	};

	const addToGoogleCalendar = () => {
		// Google fetches the URL itself, so this must be the hosted https
		// file, not a blob: a blob URL is scoped to this tab and Google cannot
		// resolve it.
		const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(
			hostedIcsUrl(window.location.origin),
		)}`;
		window.open(googleUrl, "_blank", "noopener");
	};

	type MenuEntry =
		| { readonly type: "divider" }
		| {
				readonly key: string;
				readonly label: string;
				readonly icon: React.ReactNode;
				readonly onClick: () => void;
		  };

	const calendarItems: MenuEntry[] = [
		{
			key: "download",
			label: t("app.calendar.export"),
			icon: <Download size={14} />,
			onClick: downloadAll,
		},
		{
			key: "one",
			label: t("app.calendar.export_one"),
			icon: <UserRound size={14} />,
			// A submenu target rather than a command: the per-person list is
			// rendered by `PerPersonExport` below.
			onClick: () => undefined,
		},
		{ type: "divider" },
		{
			key: "subscribe",
			label: t("app.calendar.subscribe"),
			icon: <CalendarDays size={14} />,
			onClick: subscribeICS,
		},
		{
			key: "google",
			label: "Google Calendar",
			icon: <CalendarDays size={14} />,
			onClick: addToGoogleCalendar,
		},
		{
			key: "copy",
			label: t("app.calendar.copy"),
			icon: <LinkIcon size={14} />,
			onClick: () => {
				void navigator.clipboard.writeText(
					hostedIcsUrl(window.location.origin),
				);
				notify.success(t("app.calendar.copied"));
			},
		},
	];

	return (
		<Menu position="bottom-end" shadow="md" withinPortal>
			<Menu.Target>
				<button type="button" className="tk-iconbtn">
					<CalendarDays size={15} strokeWidth={1.9} />
					<span className="tk-iconbtn__label">{t("app.calendar.export")}</span>
				</button>
			</Menu.Target>
			<Menu.Dropdown>
				{calendarItems.map((item) =>
					"type" in item ? (
						<Menu.Divider key="calendar-divider" />
					) : item.key === "one" ? (
						<PerPersonExport
							key={item.key}
							label={item.label}
							icon={item.icon}
							records={records}
							onExport={downloadOne}
						/>
					) : (
						<Menu.Item
							key={item.key}
							leftSection={item.icon}
							onClick={item.onClick}
						>
							{item.label}
						</Menu.Item>
					),
				)}
				<Menu.Divider />
				<Menu.Item
					leftSection={<Info size={14} />}
					// A caption, not a command. The two groups of actions above
					// look alike but behave completely differently -- downloads
					// include your own edits, subscriptions cannot -- and the
					// difference is invisible unless it is spelled out here.
					closeMenuOnClick={false}
					component="div"
					style={{ pointerEvents: "none", whiteSpace: "normal" }}
				>
					{t("app.calendar.hosted_hint")}
				</Menu.Item>
			</Menu.Dropdown>
		</Menu>
	);
};

/** A submenu listing every person, for a single-person `.ics`. */
const PerPersonExport = ({
	label,
	icon,
	records,
	onExport,
}: {
	readonly label: string;
	readonly icon: React.ReactNode;
	readonly records: readonly RawBirthday[];
	readonly onExport: (record: RawBirthday) => void;
}) => {
	const [opened, setOpened] = useState(false);

	return (
		// No portalling: a submenu has to stay a DOM descendant of its parent
		// dropdown for the hover tracking and outside-click detection to work.
		<Menu.Sub position="right-start" opened={opened} onChange={setOpened}>
			<Menu.Sub.Target>
				<Menu.Item leftSection={icon}>{label}</Menu.Item>
			</Menu.Sub.Target>
			<Menu.Sub.Dropdown>
				<ScrollArea.Autosize mah={280}>
					{records.map((record) => (
						<Menu.Item
							key={`${record.name}-${record.date}`}
							onClick={() => {
								onExport(record);
							}}
						>
							{record.name}
						</Menu.Item>
					))}
				</ScrollArea.Autosize>
			</Menu.Sub.Dropdown>
		</Menu.Sub>
	);
};
