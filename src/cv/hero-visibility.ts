import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

export type HeroVisibility = {
	heroRef: RefObject<HTMLElement | null>;
	heroInView: boolean;
};

export const useHeroVisibility = (): HeroVisibility => {
	const heroRef = useRef<HTMLElement>(null);
	const [inView, setInView] = useState(true);

	useEffect(() => {
		const el = heroRef.current;
		if (!el || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(([entry]) => {
			setInView(entry?.isIntersecting ?? true);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return { heroRef, heroInView: inView };
};
