import nodemailer from "nodemailer";
import type { AgentConfig } from "@/src/config";
import type { Mailer } from "./types";

/** Sends through Gmail SMTP using an app password (myaccount.google.com/apppasswords). */
export function createGmailMailer(config: AgentConfig, user: string, appPassword: string): Mailer {
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass: appPassword } });

  return {
    app: "gmail",
    live: true,
    async send(email) {
      const info = await transport.sendMail({
        from: { name: config.sender.name, address: user },
        to: email.toName ? { name: email.toName, address: email.to } : email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.threadId ? { inReplyTo: email.threadId, references: email.threadId } : {}),
      });
      return { externalId: info.messageId, threadId: email.threadId ?? info.messageId };
    },
  };
}
