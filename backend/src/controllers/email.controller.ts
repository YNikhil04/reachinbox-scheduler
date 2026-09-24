import { Request, Response } from "express";
import prisma from "../config/db";

const VALID_STATUSES = ["pending", "scheduled", "sent", "failed"] as const;

export async function listEmails(req: Request, res: Response) {
  const user = req.user as { id: string };
  if (!user?.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const status = req.query.status as string | undefined;
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);

  if (status && !VALID_STATUSES.includes(status as any)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
    });
  }

  const where = {
    campaign: { userId: user.id },
    ...(status ? { status } : {}),
  };

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        campaign: { select: { subject: true } },
      },
    }),
    prisma.email.count({ where }),
  ]);

  const shaped = emails.map((e) => ({
    id: e.id,
    recipient: e.recipient,
    subject: e.campaign.subject,
    status: e.status,
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
    errorMessage: e.errorMessage,
  }));

  res.json({
    data: shaped,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
