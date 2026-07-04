/** @param {Array<[number, number[]]>} colors */
export function valueRangeFromColorStops(colors) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < colors.length; i++) {
        const value = colors[i][0];
        if (value < min) {
            min = value;
        }
        if (value > max) {
            max = value;
        }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return [0, 1];
    }
    if (min === max) {
        return [min, min + 1];
    }
    return [min, max];
}

/** @param {unknown} range */
export function normalizeMinMaxRange(range) {
    if (range == null) {
        return undefined;
    }
    if (!Array.isArray(range) || range.length !== 2) {
        return range;
    }

    const [first, second] = range;
    const minVal = parseFloat(first);
    const maxVal = parseFloat(second);
    if (isNaN(minVal) || isNaN(maxVal)) {
        return range;
    }

    return minVal <= maxVal ? [minVal, maxVal] : [maxVal, minVal];
}
