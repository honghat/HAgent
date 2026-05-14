export interface SrsState {
  intervalDays: number;
  easeFactor: number;
  reviewCount: number;
}

export interface SrsUpdate {
  intervalDays: number;
  easeFactor: number;
  reviewCount: number;
  nextReviewAt: Date;
  lastReviewedAt: Date;
}

export function computeNextReview(
  prev: SrsState,
  quality: number
): SrsUpdate {
  const q = Math.max(0, Math.min(5, quality));
  let { intervalDays, easeFactor, reviewCount } = prev;

  if (q < 3) {
    intervalDays = 1;
  } else {
    if (reviewCount === 0) intervalDays = 1;
    else if (reviewCount === 1) intervalDays = 3;
    else intervalDays = Math.round(intervalDays * easeFactor);
  }

  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  reviewCount += 1;
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + intervalDays * 86400000);

  return { intervalDays, easeFactor, reviewCount, nextReviewAt, lastReviewedAt: now };
}

export function qualityFromScore(score: number, total: number): number {
  if (total <= 0) return 3;
  const pct = score / total;
  if (pct >= 1) return 5;
  if (pct >= 0.8) return 4;
  if (pct >= 0.6) return 3;
  if (pct >= 0.4) return 2;
  if (pct > 0) return 1;
  return 0;
}
