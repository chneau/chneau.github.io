import { useEffect, useRef } from "react";

/**
 * Magnetic micro-physics without React state: the element drifts toward the
 * cursor via a single rAF lerp writing `transform` directly. Skipped on coarse
 * pointers and fully cleaned up on unmount.
 */
export const useMagnetic = <T extends HTMLElement>(strength = 0.22) => {
	const ref = useRef<T>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (window.matchMedia?.("(pointer: coarse)").matches) return;

		let raf = 0;
		let targetX = 0;
		let targetY = 0;
		let currentX = 0;
		let currentY = 0;

		const loop = () => {
			currentX += (targetX - currentX) * 0.18;
			currentY += (targetY - currentY) * 0.18;
			el.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(
				2,
			)}px, 0)`;
			const settled =
				Math.abs(targetX - currentX) < 0.08 &&
				Math.abs(targetY - currentY) < 0.08;
			if (settled) {
				el.style.transform =
					targetX === 0 && targetY === 0 ? "" : el.style.transform;
				raf = 0;
				return;
			}
			raf = requestAnimationFrame(loop);
		};

		const kick = () => {
			if (!raf) raf = requestAnimationFrame(loop);
		};

		const onMove = (event: PointerEvent) => {
			const rect = el.getBoundingClientRect();
			targetX = (event.clientX - (rect.left + rect.width / 2)) * strength;
			targetY = (event.clientY - (rect.top + rect.height / 2)) * strength;
			kick();
		};

		const onLeave = () => {
			targetX = 0;
			targetY = 0;
			kick();
		};

		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerleave", onLeave);
		return () => {
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerleave", onLeave);
			if (raf) cancelAnimationFrame(raf);
			el.style.transform = "";
		};
	}, [strength]);

	return ref;
};
