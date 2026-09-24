import connection from "../config/redis";
import dotenv from "dotenv";
dotenv.config();

const MAX_EMAILS_PER_HOUR_PER_SENDER =
  Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER) || 200;

/**
 * Returns the current hour bucket as a string, e.g. "2026-09-24-14"
 * Every sender gets one counter key per hour, which auto-expires.
 */
function currentHourBucket(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}-${now.getUTCHours()}`;
}

/**
 * Returns the Date marking the start of the NEXT hour (UTC).
 * Used to reschedule a job when the current hour's limit is hit.
 */
export function startOfNextHour(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(now.getUTCHours() + 1);
  return next;
}

/**
 * Atomically checks and increments the per-sender hourly send counter.
 * Returns true if this send is allowed within the current hour's limit,
 * false if the sender has hit their cap for this hour.
 *
 * Safe across multiple worker processes/instances because Redis INCR
 * is atomic — two workers incrementing at the same instant never race.
 */
export async function canSendNow(senderId: string): Promise<boolean> {
  const key = `rate:${senderId}:${currentHourBucket()}`;

  const count = await connection.incr(key);

  // first increment on this key this hour — set it to expire in 1 hour
  // so old counters don't pile up in Redis forever
  if (count === 1) {
    await connection.expire(key, 3600);
  }

  return count <= MAX_EMAILS_PER_HOUR_PER_SENDER;
}

/**
 * Optional helper: decrements the counter if a send ultimately fails,
 * so a failed attempt doesn't permanently consume the sender's hourly quota.
 */
export async function releaseSlot(senderId: string): Promise<void> {
  const key = `rate:${senderId}:${currentHourBucket()}`;
  await connection.decr(key);
}
