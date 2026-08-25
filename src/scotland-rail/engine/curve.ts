// Catmull-Rom 1D evaluation
const catmullRom = (
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
	projectedPoints: { x: number; y: number }[],
) => {
	if (projectedPoints.length === 0) return;
	if (projectedPoints.length === 1) {
		const pt = projectedPoints[0] as { x: number; y: number };
		ctx.moveTo(pt.x, pt.y);
		return;
	}
	if (projectedPoints.length === 2) {
		const p0 = projectedPoints[0] as { x: number; y: number };
		const p1 = projectedPoints[1] as { x: number; y: number };
		ctx.moveTo(p0.x, p0.y);
		ctx.lineTo(p1.x, p1.y);
		return;
	}

	ctx.moveTo(projectedPoints[0]?.x ?? 0, projectedPoints[0]?.y ?? 0);

	for (let i = 0; i < projectedPoints.length - 1; i++) {
		const p0 = projectedPoints[Math.max(0, i - 1)] as { x: number; y: number };
		const p1 = projectedPoints[i] as { x: number; y: number };
		const p2 = projectedPoints[i + 1] as { x: number; y: number };
		const p3 = projectedPoints[Math.min(projectedPoints.length - 1, i + 2)] as {
			x: number;
			y: number;
		};

		// 6 subdivisions per segment for fluid 60fps high-res curve
		const steps = 6;
		for (let s = 1; s <= steps; s++) {
			const t = s / steps;
			const sx = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
			const sy = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
			ctx.lineTo(sx, sy);
		}
	}
};
