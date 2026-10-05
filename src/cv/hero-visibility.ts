import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * Whether the hero is still on screen, as a ref to put on it and a flag to read.
 *
 * The two are produced together because they are one measurement: the back-to-top
 * button is hidden exactly while the element it would scroll back to is visible.
 * Starting at `true` keeps the button hidden through the first paint, before any
 * observer has reported, rather than flashing it on a long page.
 */
export type HeroVisibility = {
	heroRef: RefObject<HTMLElement | null>;
	heroInView: boolean;
};

export const useHeroVisibility = (): HeroVisibility => {
	const heroRef = useRef<HTMLElement>(null);
	const [inView, setInView] = useState(true);

	useEffect(() => {
		const el = heroRef.current;
		// No IntersectionObserver (an old browser, or happy-dom): the button then
		// simply stays hidden, which is the harmless direction to fail in.
		if (!el || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(([entry]) => {
			setInView(entry?.isIntersecting ?? true);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return { heroRef, heroInView: inView };
};
