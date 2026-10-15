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
	return units.filter((unit, index) => index !== 0 || unit.value > 0);
};

const announcementFor = (diff: number, t: TFunction): string => {
	if (diff < HOUR_MS) return "";
	const hours = Math.floor(diff / HOUR_MS);
	if (hours < 24) return `${hours} ${t("app.countdown.hours")}`;
	return `${Math.floor(hours / 24)} ${t("app.countdown.days")}`;
};

const CountdownDigits = memo(({ deadline }: { deadline: number }) => {
	const { t } = useTranslation();
	const now = useNow(SECOND_MS);
	const diff = deadline - now;
	const units = unitsFor(diff, t);

	return (
		<>
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
	const keyed = useMemo(() => withRowKeys(birthdays), [birthdays]);
	const primary = keyed[0]?.record;

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
					<h1 className="tk-hero__name">{primary.name}</h1>
					<div className="tk-hero__pills">
						{isToday && (
							<span className="tk-pill tk-pill--accent">
								<PartyPopper size={13} strokeWidth={2} />
								{t("app.hero.today")}
							</span>
						)}
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
					<h2 className="tk-upcoming__title">{t("app.hero.closest")}</h2>
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
