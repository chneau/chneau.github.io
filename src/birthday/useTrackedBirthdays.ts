import { useEffect, useState } from "react";
import { type Birthday, birthdays, subscribeBirthdays } from "./birthdays";

export const useTrackedBirthdays = (): Birthday[] => {
	const [, bump] = useState(0);

	useEffect(() => {
		const unsubscribe = subscribeBirthdays(() => bump((value) => value + 1));
		return () => {
			unsubscribe();
		};
	}, []);

	return birthdays;
};
