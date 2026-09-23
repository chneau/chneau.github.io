type Point2D = { x: number; y: number };

// Catmull-Rom 1D evaluation
export const catmullRom = (
	p0: number,
	p1: number,
	p2: number,
	p3: number,
	t: number,
): number => {
	const t2 = t * t;
	const t3 = t2 * t;
	return (
		0.5 *
		(2 * p1 +
			(-p0 + p2) * t +
			(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
			(-p0 + 3 * p1 - 3 * p2 + p3) * t3)
	);
};

// Draw smooth Catmull-Rom spline path directly onto Canvas 2D context
export const drawSmoothPath = (
	ctx: CanvasRenderingContext2D,
	projectedPoints: readonly Point2D[],
) => {
	const len = projectedPoints.length;
	if (len === 0) return;

	const first = projectedPoints[0];
	if (!first) return;

	if (len === 1) {
		ctx.moveTo(first.x, first.y);
		return;
	}

	const second = projectedPoints[1];
	if (len === 2 && second) {
		ctx.moveTo(first.x, first.y);
		ctx.lineTo(second.x, second.y);
		return;
	}

	ctx.moveTo(first.x, first.y);

	// 6 subdivisions per segment for fluid 60fps high-res curve
	const steps = 6;
	for (let i = 0; i < len - 1; i++) {
		const p0 = projectedPoints[Math.max(0, i - 1)] ?? first;
		const p1 = projectedPoints[i] ?? first;
		const p2 = projectedPoints[i + 1] ?? p1;
		const p3 = projectedPoints[Math.min(len - 1, i + 2)] ?? p2;

		for (let s = 1; s <= steps; s++) {
			const t = s / steps;
			const sx = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
			const sy = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
			ctx.lineTo(sx, sy);
		}
	}
};
