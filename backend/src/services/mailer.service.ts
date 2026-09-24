import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.ETHEREAL_HOST,
  port: Number(process.env.ETHEREAL_PORT),
  secure: false, // Ethereal uses STARTTLS on port 587, not implicit SSL
  auth: {
    user: process.env.ETHEREAL_USER,
    pass: process.env.ETHEREAL_PASS,
  },
});

export interface SendMailParams {
  to: string;
  subject: string;
  body: string;
}

export interface SendMailResult {
  success: boolean;
  previewUrl?: string;
  error?: string;
}

export async function sendMail({
  to,
  subject,
  body,
}: SendMailParams): Promise<SendMailResult> {
  try {
    const info = await transporter.sendMail({
      from: '"ReachInbox Scheduler" <no-reply@reachinbox.test>',
      to,
      subject,
      text: body,
      html: `<p>${body}</p>`,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    console.log("✅ Email sent. Preview:", previewUrl);

    return { success: true, previewUrl };
  } catch (err: any) {
    console.error("❌ Email send failed:", err.message);
    return { success: false, error: err.message };
  }
}
