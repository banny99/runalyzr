export function angleBetweenThreePoints(a, b, c) {
    const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
    const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
    const magBa = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
    const magBc = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);
    if (magBa === 0 || magBc === 0)
        return 0;
    const cosAngle = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
    return (Math.acos(cosAngle) * 180) / Math.PI;
}
export function lateralAngle(top, bottom) {
    const dx = top.x - bottom.x;
    const dy = Math.abs(top.y - bottom.y);
    return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
}
export function midpoint(a, b) {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: (a.z + b.z) / 2,
        visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
    };
}
export function verticalDisplacement(landmarkIndex, frames) {
    const ys = frames
        .map((f) => f.landmarks[landmarkIndex]?.y ?? 0)
        .filter((y) => y > 0);
    if (ys.length < 2)
        return 0;
    let lo = ys[0], hi = ys[0];
    for (const y of ys) {
        if (y < lo)
            lo = y;
        if (y > hi)
            hi = y;
    }
    return (hi - lo) * 100;
}
export function lateralDisplacement(landmarkIndex, frames) {
    const xs = frames
        .map((f) => f.landmarks[landmarkIndex]?.x ?? 0)
        .filter((x) => x > 0);
    if (xs.length < 2)
        return 0;
    let lo = xs[0], hi = xs[0];
    for (const x of xs) {
        if (x < lo)
            lo = x;
        if (x > hi)
            hi = x;
    }
    return (hi - lo) * 100;
}
export function findLocalMaxima(values, minDistance, minProminence) {
    const indices = [];
    for (let i = 1; i < values.length - 1; i++) {
        if (values[i] <= values[i - 1] || values[i] < values[i + 1])
            continue;
        if (indices.length > 0 && i - indices[indices.length - 1] < minDistance)
            continue;
        const windowStart = Math.max(0, i - minDistance);
        const windowEnd = Math.min(values.length - 1, i + minDistance);
        const windowMin = values.slice(windowStart, windowEnd + 1)
            .reduce((min, v) => (v < min ? v : min), values[i]);
        if (values[i] - windowMin >= minProminence)
            indices.push(i);
    }
    return indices;
}
export function findLocalMinima(values, minDistance, minProminence) {
    return findLocalMaxima(values.map((v) => -v), minDistance, minProminence);
}
