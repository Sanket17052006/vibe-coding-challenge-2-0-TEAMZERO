import nodemailer from "nodemailer";

type SmtpConfiguration = {
  host: string;
  port: number;
  secure: true;
  user: string;
  pass: string;
  from: string;
};

export type OutgoingEmail = { to: string; subject: string; html: string };
type TransportMessage = OutgoingEmail & { from: string };
export type SmtpTransport = {
  verify(): Promise<unknown>;
  sendMail(message: TransportMessage): Promise<unknown>;
};
type TransportFactory = (configuration: SmtpConfiguration) => SmtpTransport;
type SmtpLogger = Pick<Console, "info" | "warn">;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function recipientAddress(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  const address = asRecord(value).address;
  return typeof address === "string" ? address.trim().toLowerCase() : "";
}

function includesRecipient(value: unknown, intended: string): boolean {
  return Array.isArray(value) && value.some((entry) => recipientAddress(entry) === intended.trim().toLowerCase());
}

function redactResponse(value: unknown, secrets: string[]): string {
  let response = String(value ?? "");
  for (const secret of secrets) if (secret) response = response.replaceAll(secret, "[REDACTED]");
  response = response
    .replace(/((?:#|[?&])token=)[^&\s"'<>]*/gi, "$1[REDACTED]")
    .replace(/\b(?:verification[ _-]?token|reset[ _-]?token|token)\s*[:=]\s*[A-Za-z0-9._~+-]+/gi, "token=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_ADDRESS]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[REDACTED]")
    .replace(/[\r\n\t\x00-\x1f]+/g, " ");
  return response.slice(0, 300);
}

function responseCode(info: Record<string, unknown>): number | null {
  if (typeof info.responseCode === "number" && Number.isInteger(info.responseCode)) return info.responseCode;
  const match = typeof info.response === "string" ? info.response.match(/^\s*(\d{3})\b/) : null;
  return match ? Number(match[1]) : null;
}

function messageId(info: Record<string, unknown>): string | null {
  if (typeof info.messageId !== "string") return null;
  return info.messageId.replace(/[\r\n\t\x00-\x1f]/g, "").slice(0, 200) || null;
}

function safeErrorCode(error: unknown): string | null {
  const code = asRecord(error).code;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : null;
}

/** Read and validate SMTP settings without including any configured values in errors. */
export function readSmtpConfiguration(env: Record<string, string | undefined> = process.env): SmtpConfiguration {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Email delivery is not configured. Set: ${missing.join(", ")}.`);

  const host = env.SMTP_HOST!.trim();
  const port = Number(env.SMTP_PORT);
  const secure = env.SMTP_SECURE!.trim().toLowerCase();
  if (host !== "smtp.gmail.com" || !Number.isInteger(port) || port !== 465 || secure !== "true") {
    throw new Error("SMTP configuration must use smtp.gmail.com on port 465 with SMTP_SECURE=true.");
  }

  return { host, port, secure: true, user: env.SMTP_USER!.trim(), pass: env.SMTP_PASS!.trim(), from: env.EMAIL_FROM!.trim() };
}

const nodemailerTransport: TransportFactory = (configuration) => nodemailer.createTransport({
  host: configuration.host,
  port: configuration.port,
  secure: configuration.secure,
  auth: { user: configuration.user, pass: configuration.pass },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
  pool: true,
  maxConnections: 2,
  maxMessages: 100,
});

/** Build a reusable sender; dependency injection keeps tests entirely off the network. */
export function createSmtpEmailSender(
  createTransport: TransportFactory = nodemailerTransport,
  getConfiguration: () => SmtpConfiguration = () => readSmtpConfiguration(),
  logger: SmtpLogger = console,
) {
  let transport: SmtpTransport | undefined;
  let verified: Promise<unknown> | undefined;

  return async function sendSmtpEmail(email: OutgoingEmail): Promise<void> {
    const configuration = getConfiguration();
    if (!transport) transport = createTransport(configuration);
    const currentTransport = transport;
    const redactions = [configuration.user, configuration.pass, configuration.from, email.to];

    if (!verified) {
      verified = currentTransport.verify().catch((error: unknown) => {
        const details = asRecord(error);
        logger.warn("SMTP connection verification failed", {
          code: safeErrorCode(error),
          responseCode: responseCode(details),
          response: redactResponse(details.response, redactions),
        });
        if (transport === currentTransport) transport = undefined;
        verified = undefined;
        throw new Error("SMTP connection verification failed.");
      });
    }

    try {
      await verified;
    } catch {
      throw new Error("SMTP connection verification failed.");
    }

    let result: unknown;
    try {
      result = await currentTransport.sendMail({ ...email, from: configuration.from });
    } catch (error) {
      const details = asRecord(error);
      logger.warn("SMTP message submission failed", {
        code: safeErrorCode(error),
        responseCode: responseCode(details),
        response: redactResponse(details.response, redactions),
        messageId: messageId(details),
        recipientAccepted: false,
        recipientRejected: includesRecipient(details.rejected, email.to),
      });
      throw new Error("SMTP email delivery failed.");
    }

    const info = asRecord(result);
    const recipientAccepted = includesRecipient(info.accepted, email.to);
    const recipientRejected = includesRecipient(info.rejected, email.to);
    const diagnostic = {
      messageId: messageId(info),
      responseCode: responseCode(info),
      response: redactResponse(info.response, redactions),
      recipientAccepted,
      recipientRejected,
    };

    if (!recipientAccepted || recipientRejected) {
      logger.warn("SMTP did not confirm acceptance of the intended recipient", diagnostic);
      throw new Error("SMTP email delivery failed.");
    }

    logger.info("SMTP accepted email submission", diagnostic);
  };
}

// This module is server-only: import it from API routes or other server code, never client components.
export const sendSmtpEmail = createSmtpEmailSender();
