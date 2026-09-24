import { Request, Response } from "express";
import { z } from "zod";
import prisma from "../config/db";
import { emailQueue } from "../queues/email.queue";

const createCampaignSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  recipients: z.array(z.string().email()).min(1),
  startTime: z.string().datetime(),
  delayMs: z.number().int().positive(),
  hourlyLimit: z.number().int().positive(),
  senderEmail: z.string().email().optional(),
});

export async function createCampaign(req: Request, res: Response) {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const {
    subject,
    body,
    recipients,
    startTime,
    delayMs,
    hourlyLimit,
    senderEmail,
  } = parsed.data;
  const user = req.user as { id: string };

  if (!user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // find or create a sender for this user
  const sender = await prisma.sender
    .upsert({
      where: {
        // composite lookup workaround since we don't have a unique constraint on (userId, email):
        // simplest safe approach — find first, else create
        id:
          (
            await prisma.sender.findFirst({
              where: {
                userId: user.id,
                email: senderEmail || `${user.id}@default.sender`,
              },
            })
          )?.id || "00000000-0000-0000-0000-000000000000",
      },
      update: {},
      create: {
        userId: user.id,
        email: senderEmail || `${user.id}@default.sender`,
      },
    })
    .catch(async () => {
      // fallback if the upsert's fake id path fails: plain findFirst-or-create
      const existing = await prisma.sender.findFirst({
        where: {
          userId: user.id,
          email: senderEmail || `${user.id}@default.sender`,
        },
      });
      if (existing) return existing;
      return prisma.sender.create({
        data: {
          userId: user.id,
          email: senderEmail || `${user.id}@default.sender`,
        },
      });
    });

  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      subject,
      body,
      startTime: new Date(startTime),
      delayMs,
      hourlyLimit,
    },
  });

  const baseTime = new Date(startTime).getTime();
  const createdEmails = [];

  // Insert all email rows + enqueue jobs with staggered delays
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const sendAt = baseTime + i * delayMs;
    const delayFromNow = Math.max(sendAt - Date.now(), 0);

    const email = await prisma.email.create({
      data: {
        campaignId: campaign.id,
        senderId: sender.id,
        recipient,
        status: "scheduled",
        scheduledAt: new Date(sendAt),
      },
    });

    const job = await emailQueue.add(
      "send-email",
      {
        emailId: email.id,
        senderId: sender.id,
        recipient,
        subject,
        body,
      },
      {
        jobId: email.id, // idempotency anchor
        delay: delayFromNow,
      },
    );

    await prisma.email.update({
      where: { id: email.id },
      data: { bullmqJobId: job.id },
    });

    createdEmails.push(email);
  }

  res.status(201).json({
    campaignId: campaign.id,
    scheduledCount: createdEmails.length,
  });
}
