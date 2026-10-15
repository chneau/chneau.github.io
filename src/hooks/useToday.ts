import dayjs from "dayjs";
import { useEffect, useState } from "react";

export const useCalendarDay = (): dayjs.Dayjs => {
	const [day, setDay] = useState(() => dayjs().startOf("day"));

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;

		const sync = () => {
			if (timer !== undefined) clearTimeout(timer);
			const now = dayjs().startOf("day");
			setDay((previous) => (previous.isSame(now, "day") ? previous : now));
			timer = setTimeout(sync, now.add(1, "day").diff(dayjs()) + 250);
		};

		const onVisible = () => {
			if (document.visibilityState === "visible") sync();
		};

		const now = dayjs().startOf("day");
		setDay((previous) => (previous.isSame(now, "day") ? previous : now));
		timer = setTimeout(sync, now.add(1, "day").diff(dayjs()) + 250);
		document.addEventListener("visibilitychange", onVisible);
		window.addEventListener("focus", onVisible);

		return () => {
			if (timer !== undefined) clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisible);
			window.removeEventListener("focus", onVisible);
		};
	}, []);

	return day;
};
