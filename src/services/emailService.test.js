import assert from "node:assert/strict";
import test from "node:test";

import {
  createVerificationToken,
  hashVerificationToken,
  isEmailVerificationEnabled,
  isSmtpConfigured,
  ORDER_STATUS_COPY,
  sendVerificationEmail,
} from "./emailService.js";

test("verification tokens are random and stored as one-way hashes", () => {
  const first = createVerificationToken();
  const second = createVerificationToken();

  assert.equal(first.token.length, 64);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashVerificationToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
});

test("transactional email templates cover every customer order status", () => {
  assert.deepEqual(Object.keys(ORDER_STATUS_COPY), [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ]);
  for (const copy of Object.values(ORDER_STATUS_COPY)) {
    assert.ok(copy.title);
    assert.ok(copy.message);
  }
});

test("email verification is disabled until SMTP credentials are configured", async () => {
  const original = {
    host: process.env.SMTP_HOST,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    required: process.env.EMAIL_VERIFICATION_REQUIRED,
  };

  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  process.env.EMAIL_VERIFICATION_REQUIRED = "true";

  try {
    assert.equal(isSmtpConfigured(), false);
    assert.equal(isEmailVerificationEnabled(), false);
    await assert.rejects(
      sendVerificationEmail({ name: "Test", email: "test@example.com" }, "token"),
      /SMTP is not configured/
    );
  } finally {
    if (original.host === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = original.host;
    if (original.user === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = original.user;
    if (original.pass === undefined) delete process.env.SMTP_PASS;
    else process.env.SMTP_PASS = original.pass;
    if (original.required === undefined) {
      delete process.env.EMAIL_VERIFICATION_REQUIRED;
    } else {
      process.env.EMAIL_VERIFICATION_REQUIRED = original.required;
    }
  }
});
