import { Queue } from "bullmq";
import connection from "../config/redis";

export const EMAIL_QUEUE_NAME = "email-queue";

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3, // retry a failed send up to 3 times
    backoff: {
      type: "exponential",
      delay: 5000, // 5s, 10s, 20s between retries
    },
    removeOnComplete: {
      age: 3600 * 24, // keep completed jobs 24h for debugging, then auto-clean
    },
    removeOnFail: false, // keep failed jobs visible for inspection
  },
});
