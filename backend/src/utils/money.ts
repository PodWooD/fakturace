export const normalizeNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
        const normalized = value.replace(',', '.').trim();
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
};

export const toCents = (value: unknown): number | null => {
    const numeric = normalizeNumber(value);
    if (numeric === null) {
        return null;
    }
    return Math.round(numeric * 100);
};

export const fromCents = (value: number | null | undefined, digits = 2): number | null => {
    if (value === null || value === undefined) {
        return null;
    }
    return Number((value / 100).toFixed(digits));
};
