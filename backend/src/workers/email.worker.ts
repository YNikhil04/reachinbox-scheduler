import { Worker, Job, DelayedError } from "bullmq";
import connection from "../config/redis";
import prisma from "../config/db";
import { sendMail } from "../services/mailer.service";
import { canSendNow, startOfNextHour } from "../services/rateLimiter.service";
import { EMAIL_QUEUE_NAME } from "../queues/email.queue";

interface EmailJobData {
  emailId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
}

async function processor(job: Job<EmailJobData>, token?: string) {
  const { emailId, senderId, recipient, subject, body } = job.data;

  // ── 1. Idempotency check ─────────────────────────────────────
  // Re-fetch the DB row fresh — if it's already sent, this job is a
  // duplicate/retry that arrived after a previous successful send.
  const email = await prisma.email.findUnique({ where: { id: emailId } });

  if (!email) {
    console.warn(`⚠️ Email ${emailId} not found in DB — skipping.`);
    return { skipped: true, reason: "not_found" };
  }

  if (email.status === "sent") {
    console.log(`⏭️ Email ${emailId} already sent — skipping duplicate job.`);
    return { skipped: true, reason: "already_sent" };
  }

  // ── 2. Rate limit check ──────────────────────────────────────
  const allowed = await canSendNow(senderId);

  if (!allowed) {
    // Do NOT fail the job — push it to the start of the next hour window.
    const nextWindow = startOfNextHour();
    console.log(
      `⏳ Rate limit hit for sender ${senderId}. Rescheduling email ${emailId} to ${nextWindow.toISOString()}`,
    );

    await job.moveToDelayed(nextWindow.getTime(), token);
    // Throwing DelayedError tells BullMQ this job was intentionally
    // deferred — it won't be marked as failed.
    throw new DelayedError();
  }

  // ── 3. Send ───────────────────────────────────────────────────
  const result = await sendMail({ to: recipient, subject, body });

  // ── 4. Update DB ─────────────────────────────────────────────
  if (result.success) {
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "sent", sentAt: new Date() },
    });
    console.log(`✅ Email ${emailId} sent. Preview: ${result.previewUrl}`);
  } else {
    await prisma.email.update({
      where: { id: emailId },
      data: { status: "failed", errorMessage: result.error },
    });
    // Throw so BullMQ's retry/backoff policy (set on the queue) kicks in
    throw new Error(result.error || "Send failed");
  }

  return { success: true, previewUrl: result.previewUrl };
}

export const emailWorker = new Worker(EMAIL_QUEUE_NAME, processor, {
  connection,
  concurrency: Number(process.env.WORKER_CONCURRENCY) || 5,
  limiter: {
    max: 1,
    duration: Number(process.env.MIN_DELAY_MS) || 2000, // min delay between dispatches
  },
});

emailWorker.on("completed", (job) => {
  console.log(`🎉 Job ${job.id} completed`);
});

emailWorker.on("failed", (job, err) => {
  console.error(`💥 Job ${job?.id} failed:`, err.message);
});

console.log("👷 Email worker started, waiting for jobs...");
