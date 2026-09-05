export const formatTime = (minutes: number | null): string => {
	if (minutes === null) return "—";
	const h = Math.floor(minutes / 60) % 24;
	const m = Math.floor(minutes % 60);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
