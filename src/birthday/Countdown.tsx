import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { ArrowUpRight, CalendarDays, Moon, PartyPopper } from "lucide-react";
import {
	type CSSProperties,
	memo,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { withRowKeys } from "./BirthdayTable";
import type { Birthday } from "./birthdays";
import { KindIcon, kindLabelKey } from "./KindIcon";
import { dataStore } from "./store";
import { useMagnetic } from "./useMagnetic";
import { useTrackedBirthdays } from "./useTrackedBirthdays";

dayjs.extend(duration);

const SECOND_MS = 1_000;
const HOUR_MS = 60 * 60 * SECOND_MS;

type TFunction = ReturnType<typeof useTranslation>["t"];

/**
 * A clock that neither drifts nor lies.
 *
 * `setInterval(fn, 1000)` reschedules 1000ms after the *previous callback
 * returned*, so any work inside it is added to every period and the displayed
 * value creeps later. Worse, browsers throttle timers in a background tab to
 * roughly one a minute: the digits would sit frozen showing a time up to a
 * minute out of date, and nothing would fix it until the next lucky tick.
 *
 * So the timeout is rescheduled from the wall clock — aligned to the next
 * whole boundary of `periodMs`, so a slow frame costs a fraction of a tick
 * instead of a whole one — and a `visibilitychange` resync corrects the value
 * the instant the tab comes back to the foreground.
 */
const useNow = (periodMs: number): number => {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		let timeout: ReturnType<typeof setTimeout> | undefined;

		const run = () => {
			setNow(Date.now());
			schedule();
		};
		const schedule = () => {
			const drift = Date.now() % periodMs;
			timeout = setTimeout(run, drift === 0 ? periodMs : periodMs - drift);
		};
		const resync = () => {
			if (!document.hidden) setNow(Date.now());
		};

		schedule();
		document.addEventListener("visibilitychange", resync);
		return () => {
			if (timeout !== undefined) clearTimeout(timeout);
			document.removeEventListener("visibilitychange", resync);
		};
	}, [periodMs]);

	return now;
};

type CountUnit = { id: string; label: string; value: number };

const unitsFor = (diff: number, t: TFunction): CountUnit[] => {
	if (diff <= 0) {
		return [{ id: "s", label: t("app.countdown.secs"), value: 0 }];
	}
	const dur = dayjs.duration(diff);
	const units: CountUnit[] = [
		{
			id: "d",
			label: t("app.countdown.days"),
			value: Math.floor(dur.asDays()),
		},
		{ id: "h", label: t("app.countdown.hours"), value: dur.hours() },
		{ id: "m", label: t("app.countdown.mins"), value: dur.minutes() },
		{ id: "s", label: t("app.countdown.secs"), value: dur.seconds() },
	];
	// A leading "00 Days" is noise; every unit below the first non-zero one is
	// worth keeping, because that is the part actually counting down.
	return units.filter((unit, index) => index !== 0 || unit.value > 0);
};

/**
 * What a screen reader is told, as opposed to what is shown.
 *
 * The original put `aria-live="polite"` on the digits, which asks an assistive
 * technology to interrupt the user once a second, for as long as the page is
 * open — the most hostile possible use of a live region. The digits are now
 * ordinary readable text with no live semantics, and this coarse summary is
 * the only thing announced.
 *
 * It carries the largest non-zero unit and nothing finer, so it changes at
 * most once an hour. Inside the final hour it is empty: the remaining time is
 * a number of seconds, there is no coarse way to say that, and repeating
 * "0 hours" every minute is exactly the noise this is avoiding.
 */
const announcementFor = (diff: number, t: TFunction): string => {
	if (diff < HOUR_MS) return "";
	const hours = Math.floor(diff / HOUR_MS);
	if (hours < 24) return `${hours} ${t("app.countdown.hours")}`;
	return `${Math.floor(hours / 24)} ${t("app.countdown.days")}`;
};

/**
 * The only part of the hero that re-renders on a clock.
 *
 * Isolated and memoised so that ticking the seconds does not re-run the
 * dataset-wide `tracked.find` / `tracked.filter` in the parent, nor re-diff
 * the pills, the stat lines and the magnetic button fifty times a minute.
 * `deadline` is a number, so the prop comparison is exact.
 */
const CountdownDigits = memo(({ deadline }: { deadline: number }) => {
	const { t } = useTranslation();
	const now = useNow(SECOND_MS);
	const diff = deadline - now;
	const units = unitsFor(diff, t);

	return (
		<>
			{/* `role="status"` is `aria-live="polite"` with `aria-atomic`, and is
			    the only live region here. Its text changes at most hourly. */}
			<p className="sr-only" role="status">
				{announcementFor(diff, t)}
			</p>
			<div className="tk-count">
				{units.map((unit) => (
					<div className="tk-count__unit" key={unit.id}>
						<span
							className={
								unit.id === "s"
									? "tk-count__value tk-count__value--accent"
									: "tk-count__value"
							}
						>
							{String(unit.value).padStart(2, "0")}
						</span>
						<span className="tk-count__label">{unit.label}</span>
					</div>
				))}
			</div>
		</>
	);
});

CountdownDigits.displayName = "CountdownDigits";

type CountdownProps = {
	birthdays: Birthday[];
	onManage?: () => void;
};

export const Countdown = ({ birthdays, onManage }: CountdownProps) => {
	const { t } = useTranslation();
	const magneticRef = useMagnetic<HTMLDivElement>(0.14);
	// `withRowKeys` comes from `BirthdayTable`: `Birthday` carries no id, so a
	// record's React key is a fingerprint of what it shows plus an occurrence
	// index, which is collision-free even for two records sharing a name and a
	// date. Memoised before the early return below.
	const keyed = useMemo(() => withRowKeys(birthdays), [birthdays]);
	const primary = keyed[0]?.record;

	/**
	 * The four dataset-wide scans below used to sit in a `useMemo` with an empty
	 * dependency array, under a comment saying they were "keyed on its identity".
	 * They were not: `tracked` was the imported module binding, so the people
	 * count, the this-month count, the wedding count and the next milestone's
	 * name were computed once at mount and never again — stale until a full
	 * remount, while the memo six lines above (which does carry `[birthdays]`)
	 * refreshed correctly. The two sat side by side looking identical.
	 *
	 * `tsc` cannot see this and `exhaustive-deps` cannot either, because the
	 * read is an imported binding rather than a prop or state.
	 */
	const tracked = useTrackedBirthdays();
	const { nextMilestone, thisMonth, weddings, people } = useMemo(() => {
		const milestone = tracked.find(
			(b) => b.milestone && b.daysBeforeBirthday >= 0,
		);
		return {
			nextMilestone: milestone?.name,
			thisMonth: tracked.filter((b) => b.month === dayjs().month() + 1).length,
			weddings: tracked.filter((b) => b.kind === "💒").length,
			people: tracked.length,
		};
	}, [tracked]);

	if (!primary) {
		return (
			<section className="reveal" style={{ "--i": 0 } as CSSProperties}>
				<div className="tk-panel tk-hero__primary">
					<div className="tk-empty">
						<span className="tk-empty__mark">
							<CalendarDays size={22} strokeWidth={1.5} />
						</span>
						<h3>{t("app.hero.no_title")}</h3>
						<p>{t("app.hero.no_body")}</p>
						{onManage && (
							<button
								type="button"
								className="tk-iconbtn tk-iconbtn--accent"
								onClick={onManage}
							>
								{t("app.hero.manage")}
							</button>
						)}
					</div>
				</div>
			</section>
		);
	}

	const isToday = primary.daysBeforeBirthday === 0;
	// A plain number, so `CountdownDigits`' memo is exact, and derived without
	// a hook because it cannot be: this line sits after the early return above.
	const deadline = (
		isToday
			? dayjs(primary.nextBirthday).endOf("day")
			: dayjs(primary.nextBirthday)
	).valueOf();

	const progress = Math.min(100, Math.max(0, primary.progress));
	const nextAge = isToday ? primary.age : primary.age + 1;
	const rest = keyed.slice(1, 4);

	const stats: { label: string; value: ReactNode }[] = [
		{ label: t("app.hero.people"), value: people.toLocaleString() },
		{ label: t("app.hero.this_month"), value: thisMonth.toLocaleString() },
		{ label: t("app.hero.weddings"), value: weddings.toLocaleString() },
		{
			label: t("app.hero.milestone"),
			value: nextMilestone ?? t("app.hero.none"),
		},
	];

	return (
		<section className="tk-hero">
			<article
				className="tk-panel tk-hero__primary reveal"
				style={{ "--i": 0 } as CSSProperties}
			>
				<div className="tk-hero__glow" aria-hidden="true" />

				<div>
					<span className="tk-eyebrow">
						{isToday ? (
							<PartyPopper size={13} strokeWidth={2} />
						) : (
							<CalendarDays size={13} strokeWidth={2} />
						)}
						{isToday ? t("app.hero.today") : t("app.hero.eyebrow")}
					</span>
					<h1 className="tk-hero__name">{primary.name}</h1>
					<div className="tk-hero__pills">
						<span className="tk-pill">
							<KindIcon kind={primary.kind} size={13} />
							{t(kindLabelKey(primary.kind))}
						</span>
						<span className="tk-pill">
							{t("app.hero.turning", { age: nextAge })}
						</span>
						<span className="tk-pill">
							{primary.signSymbol} {t(`data.zodiac.${primary.sign}`)}
						</span>
						<span className="tk-pill">
							<Moon size={12} strokeWidth={1.75} />
							{t(`data.moon_phases.${primary.moonPhase}`)}
						</span>
					</div>
				</div>

				<div>
					<CountdownDigits deadline={deadline} />

					<div className="tk-progress">
						<div className="tk-progress__track">
							<div
								className="tk-progress__fill"
								style={{ width: `${progress}%` }}
							/>
						</div>
						<div className="tk-progress__meta">
							<span>
								{dayjs(primary.nextBirthday).format("ddd, D MMM YYYY")}
							</span>
							<span>
								{t("app.hero.cycle", { percent: progress.toFixed(1) })}
							</span>
						</div>
					</div>

					<div
						className="tk-magnetic"
						ref={magneticRef}
						style={{ marginTop: 24 }}
					>
						<button
							type="button"
							className="tk-iconbtn tk-iconbtn--accent"
							onClick={() => {
								dataStore.selectedBirthday = primary;
							}}
						>
							{t("app.hero.details")}
							<ArrowUpRight size={15} strokeWidth={2} />
						</button>
					</div>
				</div>
			</article>

			<aside
				className="tk-hero__side reveal"
				style={{ "--i": 1 } as CSSProperties}
			>
				{stats.map((stat) => (
					<div className="tk-statline" key={stat.label}>
						<span className="tk-statline__label">{stat.label}</span>
						<span className="tk-statline__value">{stat.value}</span>
					</div>
				))}

				<div className="tk-upcoming">
					<span className="tk-eyebrow">{t("app.hero.closest")}</span>
					{rest.length > 0 ? (
						rest.map(({ record: b, key }) => (
							<button
								type="button"
								className="tk-upcoming__row"
								key={key}
								onClick={() => {
									dataStore.selectedBirthday = b;
								}}
							>
								<span className="tk-upcoming__name">{b.name}</span>
								<span className="tk-upcoming__when">
									{b.daysBeforeBirthday === 0
										? t("app.hero.today")
										: `${b.daysBeforeBirthday} ${t("table.days")}`}
								</span>
							</button>
						))
					) : (
						<span
							className="tk-upcoming__when"
							style={{ display: "block", paddingTop: 10 }}
						>
							{t(`data.months.${primary.monthName}`)}
						</span>
					)}
				</div>
			</aside>
		</section>
	);
};
