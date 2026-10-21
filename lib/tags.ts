/** Compare version-like image tags of the same shape (prefix, precision, variant suffix). */

export type UpdateLevel = "major" | "minor" | "patch" | "date";

type ParsedTag = {
  /** Tags are only compared with tags of the same shape, e.g. "|2|-alpine". */
  shape: string;
  numbers: number[];
  date: boolean;
};

export function parseTag(tag: string): ParsedTag | null {
  const date = tag.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (date) {
    return { shape: "date", numbers: date.slice(1).map(Number), date: true };
  }

  const version = tag.match(/^(v?)(\d+(?:\.\d+)*)(.*)$/);
  if (!version) return null;
  const [, prefix, numeric, suffix] = version;
  const numbers = numeric.split(".").map(Number);
  return { shape: `${prefix}|${numbers.length}|${suffix}`, numbers, date: false };
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function level(current: ParsedTag, newer: ParsedTag): UpdateLevel {
  if (current.date) return "date";
  const index = current.numbers.findIndex((n, i) => n !== newer.numbers[i]);
  if (index === 0) return "major";
  if (index === 1) return "minor";
  return "patch";
}

export type TagComparison = {
  /** Newest tag of the same shape, when newer than the current one. */
  newest?: string;
  newestLevel?: UpdateLevel;
  /** Newest tag within the current major, when it differs from `newest`. */
  newestSameMajor?: string;
  newestSameMajorLevel?: UpdateLevel;
};

/** Returns null when the current tag is not version-like (latest, alpine, 1.x, …). */
export function compareTags(current: string, available: string[]): TagComparison | null {
  const parsed = parseTag(current);
  if (!parsed) return null;

  let newest: { tag: string; parsed: ParsedTag } | null = null;
  let sameMajor: { tag: string; parsed: ParsedTag } | null = null;

  for (const tag of available) {
    const candidate = parseTag(tag);
    if (!candidate || candidate.shape !== parsed.shape) continue;
    if (compare(candidate.numbers, parsed.numbers) <= 0) continue;

    if (!newest || compare(candidate.numbers, newest.parsed.numbers) > 0) {
      newest = { tag, parsed: candidate };
    }
    const keepsMajor = !parsed.date && candidate.numbers[0] === parsed.numbers[0];
    if (keepsMajor && (!sameMajor || compare(candidate.numbers, sameMajor.parsed.numbers) > 0)) {
      sameMajor = { tag, parsed: candidate };
    }
  }

  const result: TagComparison = {};
  if (newest) {
    result.newest = newest.tag;
    result.newestLevel = level(parsed, newest.parsed);
  }
  if (sameMajor && sameMajor.tag !== newest?.tag) {
    result.newestSameMajor = sameMajor.tag;
    result.newestSameMajorLevel = level(parsed, sameMajor.parsed);
  }
  return result;
}
