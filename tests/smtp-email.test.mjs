import test from "node:test";
import assert from "node:assert/strict";
import { createAuthEmailSender } from "../lib/email-auth.ts";
import { emailActionLink } from "../lib/email-link.ts";
import { createSmtpEmailSender, readSmtpConfiguration } from "../lib/smtp-email.ts";

function validEnvironment(overrides = {}) {
  return {
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: "465",
    SMTP_SECURE: "true",
    SMTP_USER: "sender@gmail.com",
    SMTP_PASS: "test-app-password",
    EMAIL_FROM: "KhelGrid <sender@gmail.com>",
    APP_URL: "https://khelgrid.example",
    NODE_ENV: "test",
    ...overrides,
  };
}

test("SMTP configuration accepts Gmail SSL settings and rejects invalid host, port, or security", () => {
  const configuration = readSmtpConfiguration(validEnvironment());
  assert.deepEqual(configuration, {
    host: "smtp.gmail.com", port: 465, secure: true, user: "sender@gmail.com",
    pass: "test-app-password", from: "KhelGrid <sender@gmail.com>",
  });
  assert.throws(() => readSmtpConfiguration(validEnvironment({ SMTP_HOST: "mail.example.com" })), /smtp\.gmail\.com/);
  assert.throws(() => readSmtpConfiguration(validEnvironment({ SMTP_PORT: "587" })), /port 465/);
  assert.throws(() => readSmtpConfiguration(validEnvironment({ SMTP_SECURE: "false" })), /SMTP_SECURE=true/);
});

test("missing SMTP credentials are identified without revealing configured secrets", () => {
  assert.throws(() => readSmtpConfiguration(validEnvironment({ SMTP_PASS: "" })), (error) => {
    assert.match(error.message, /SMTP_PASS/);
    assert.doesNotMatch(error.message, /test-app-password|sender@gmail\.com/);
    return true;
  });
});

test("verification and reset emails retain their KhelGrid templates and fragment links", async () => {
  const sent = [];
  const sendAuthEmail = createAuthEmailSender(async (message) => { sent.push(message); }, validEnvironment(), emailActionLink);

  await sendAuthEmail("verify", "player@example.com", "verification-token");
  await sendAuthEmail("reset", "player@example.com", "reset-token");

  assert.equal(sent.length, 2);
  assert.equal(sent[0].subject, "Verify your KhelGrid email");
  assert.match(sent[0].html, /KHELGRID/);
  assert.match(sent[0].html, /href="https:\/\/khelgrid\.example\/verify-email#token=verification-token"/);
  assert.match(sent[0].html, /24 hours/);
  assert.equal(sent[1].subject, "Reset your KhelGrid password");
  assert.match(sent[1].html, /href="https:\/\/khelgrid\.example\/reset-password#token=reset-token"/);
  assert.match(sent[1].html, /30 minutes/);
});

test("SMTP sender verifies and reuses one mocked transporter for both message types", async () => {
  const environment = validEnvironment();
  const messages = [];
  const logs = [];
  let transportsCreated = 0;
  let verifyCalls = 0;
  const send = createSmtpEmailSender((configuration) => {
    transportsCreated++;
    assert.equal(configuration.host, "smtp.gmail.com");
    assert.equal(configuration.port, 465);
    assert.equal(configuration.secure, true);
    return {
      async verify() { verifyCalls++; },
      async sendMail(message) {
        messages.push(message);
        return { messageId: "<smtp-message-123@example.test>", accepted: [message.to], rejected: [], response: "250 2.0.0 queued" };
      },
    };
  }, () => readSmtpConfiguration(environment), {
    info(event, details) { logs.push({ level: "info", event, details }); },
    warn(event, details) { logs.push({ level: "warn", event, details }); },
  });

  await send({ to: "one@example.com", subject: "Verify", html: "verify body" });
  await send({ to: "two@example.com", subject: "Reset", html: "reset body" });

  assert.equal(transportsCreated, 1);
  assert.equal(verifyCalls, 1);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].from, environment.EMAIL_FROM);
  assert.equal(messages[1].to, "two@example.com");
  assert.equal(logs[0].details.recipientAccepted, true);
  assert.equal(logs[0].details.recipientRejected, false);
  assert.equal(logs[0].details.responseCode, 250);
  assert.equal(logs[0].details.messageId, "<smtp-message-123@example.test>");
});

test("SMTP diagnostics confirm the exact intended address in accepted results without logging it", async () => {
  const environment = validEnvironment();
  const logs = [];
  const send = createSmtpEmailSender(() => ({
    async verify() {},
    async sendMail(message) {
      assert.equal(message.to, "member+tag@example.com");
      return { accepted: [{ address: "MEMBER+TAG@EXAMPLE.COM", name: "Member" }], rejected: [], messageId: "<accepted-1@example.test>", response: "250 2.0.0 queued for delivery" };
    },
  }), () => readSmtpConfiguration(environment), {
    info(event, details) { logs.push({ level: "info", event, details }); },
    warn(event, details) { logs.push({ level: "warn", event, details }); },
  });

  await send({ to: "member+tag@example.com", subject: "Verify", html: "body" });

  assert.equal(logs[0].details.recipientAccepted, true);
  assert.equal(logs[0].details.recipientRejected, false);
  assert.equal(JSON.stringify(logs).includes("member+tag@example.com"), false);
});

test("SMTP diagnostics reject a recipient listed in rejected and safely capture response metadata", async () => {
  const environment = validEnvironment();
  const logs = [];
  const send = createSmtpEmailSender(() => ({
    async verify() {},
    async sendMail() {
      return { accepted: [], rejected: ["player@example.com"], messageId: "<rejected-1@example.test>", response: "550 5.1.1 token=do-not-log" };
    },
  }), () => readSmtpConfiguration(environment), {
    info(event, details) { logs.push({ level: "info", event, details }); },
    warn(event, details) { logs.push({ level: "warn", event, details }); },
  });

  await assert.rejects(send({ to: "player@example.com", subject: "Verify", html: "#token=do-not-log" }), /SMTP email delivery failed/);

  assert.equal(logs.length, 1);
  assert.equal(logs[0].details.recipientAccepted, false);
  assert.equal(logs[0].details.recipientRejected, true);
  assert.equal(logs[0].details.responseCode, 550);
  assert.equal(logs[0].details.response, "550 5.1.1 token=[REDACTED]");
  assert.equal(logs[0].details.messageId, "<rejected-1@example.test>");
  assert.equal(JSON.stringify(logs).includes("player@example.com"), false);
  assert.equal(JSON.stringify(logs).includes("do-not-log"), false);
});

test("missing SMTP configuration fails before constructing a transport", async () => {
  let transportsCreated = 0;
  const send = createSmtpEmailSender(() => {
    transportsCreated++;
    throw new Error("Transport should not be created");
  }, () => readSmtpConfiguration(validEnvironment({ SMTP_USER: "", SMTP_PASS: "" })));

  await assert.rejects(send({ to: "player@example.com", subject: "Test", html: "body" }), /SMTP_USER, SMTP_PASS/);
  assert.equal(transportsCreated, 0);
});

test("SMTP verification and provider failures return sanitized errors, not credentials or tokens", async () => {
  const pass = "secret-app-password";
  const token = "sensitive-reset-token";
  const logs = [];
  const config = () => readSmtpConfiguration(validEnvironment({ SMTP_PASS: pass }));
  const rejectedSend = createSmtpEmailSender(() => ({
    async verify() {},
    async sendMail() { throw new Error(`provider rejected ${pass} for ${token}`); },
  }), config, {
    info(event, details) { logs.push({ level: "info", event, details }); },
    warn(event, details) { logs.push({ level: "warn", event, details }); },
  });
  await assert.rejects(rejectedSend({ to: "player@example.com", subject: "Reset", html: token }), (error) => {
    assert.equal(error.message, "SMTP email delivery failed.");
    assert.doesNotMatch(error.message, /secret-app-password|sensitive-reset-token/);
    return true;
  });

  const rejectedVerify = createSmtpEmailSender(() => ({
    async verify() { throw new Error(`auth failed with ${pass}`); },
    async sendMail() { assert.fail("sendMail must not run when verification fails"); },
  }), config, {
    info(event, details) { logs.push({ level: "info", event, details }); },
    warn(event, details) { logs.push({ level: "warn", event, details }); },
  });
  await assert.rejects(rejectedVerify({ to: "player@example.com", subject: "Verify", html: token }), (error) => {
    assert.equal(error.message, "SMTP connection verification failed.");
    assert.doesNotMatch(error.message, /secret-app-password|sensitive-reset-token/);
    return true;
  });
  assert.doesNotMatch(JSON.stringify(logs), /secret-app-password|sensitive-reset-token/);
});
