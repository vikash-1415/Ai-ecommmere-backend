import crypto from "node:crypto";
import nodemailer from "nodemailer";

let transporter;

export const ORDER_STATUS_COPY = {
  pending: {
    title: "We received your order",
    message: "Your order is in our system and is awaiting confirmation.",
  },
  confirmed: {
    title: "Your order is confirmed",
    message: "Your order is confirmed and we are getting it ready.",
  },
  processing: {
    title: "We are preparing your order",
    message: "Our team is packing your items for dispatch.",
  },
  shipped: {
    title: "Your order is on its way",
    message: "Your order has been handed to the courier.",
  },
  delivered: {
    title: "Your order has been delivered",
    message: "We hope you enjoy your WeatherCart purchase.",
  },
  cancelled: {
    title: "Your order was cancelled",
    message: "This order has been cancelled. Contact us if you need help.",
  },
};

export function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export function isEmailVerificationEnabled() {
  return (
    isSmtpConfigured() &&
    process.env.EMAIL_VERIFICATION_REQUIRED?.toLowerCase() !== "false"
  );
}

export function createVerificationToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
  };
}

export function hashVerificationToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getTransporter() {
  if (!isSmtpConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS."
    );
  }

  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("SMTP_PORT must be a valid TCP port.");
    }

    const isGmail =
      process.env.SMTP_HOST?.toLowerCase().includes("gmail") ||
      process.env.SMTP_USER?.toLowerCase().includes("@gmail.com");

    transporter = nodemailer.createTransport(
      isGmail
        ? {
            service: "gmail",
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
          }
        : {
            host: process.env.SMTP_HOST,
            port,
            secure:
              process.env.SMTP_SECURE?.toLowerCase() === "true" || port === 465,
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
            tls: {
              rejectUnauthorized: false,
            },
          }
    );
  }

  return transporter;
}

function getSender() {
  return (
    process.env.SMTP_FROM?.trim() ||
    `"WeatherCart" <${process.env.SMTP_USER}>`
  );
}

function getFrontendUrl() {
  return (
    process.env.FRONTEND_URL?.trim() ||
    "https://ai-ecommmere.vercel.app"
  ).replace(/\/+$/, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function renderEmail({ preheader, eyebrow, title, intro, content, ctaUrl, ctaLabel }) {
  const cta = ctaUrl
    ? `<tr><td align="center" style="padding:28px 0 8px"><a href="${escapeHtml(
        ctaUrl
      )}" style="display:inline-block;background:#0f172a;border-radius:10px;color:#ffffff;font-size:14px;font-weight:700;padding:14px 24px;text-decoration:none">${escapeHtml(
        ctaLabel
      )}</a></td></tr>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(
    preheader
  )}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden"><tr><td style="background:#0f172a;padding:24px 32px;color:#ffffff"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7dd3fc;font-weight:700">WeatherCart</div><div style="font-size:12px;color:#cbd5e1;margin-top:6px">Shop for every forecast</div></td></tr><tr><td style="padding:32px"><div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#2563eb;font-weight:700">${escapeHtml(
    eyebrow
  )}</div><h1 style="margin:10px 0 12px;font-size:26px;line-height:1.25;color:#0f172a">${escapeHtml(
    title
  )}</h1><p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6">${escapeHtml(
    intro
  )}</p>${content}${cta ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${cta}</table>` : ""}<p style="margin:28px 0 0;color:#64748b;font-size:12px;line-height:1.6">Need help? Reply to this email and our team will assist you.</p></td></tr><tr><td style="border-top:1px solid #e2e8f0;padding:18px 32px;color:#94a3b8;font-size:11px;line-height:1.5">This is a transactional message from WeatherCart about your account or order.</td></tr></table></td></tr></table></body></html>`;
}

function renderOrderDetails(order) {
  const address = order.shippingAddress || {};
  const items = order.items
    .map(
      (item) =>
        `<tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0"><div style="font-size:14px;font-weight:700;color:#0f172a">${escapeHtml(
          item.name
        )}</div><div style="font-size:12px;color:#64748b;margin-top:4px">Quantity: ${
          Number(item.quantity) || 0
        }</div></td><td align="right" style="padding:12px 0;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155;white-space:nowrap">${formatCurrency(
          Number(item.price) * Number(item.quantity)
        )}</td></tr>`
    )
    .join("");

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;padding:16px"><tr><td colspan="2" style="padding-bottom:10px"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Order number</div><div style="margin-top:4px;font-size:16px;font-weight:700;color:#0f172a">${escapeHtml(
    order.orderNumber
  )}</div></td></tr>${items}<tr><td colspan="2" style="padding-top:18px"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px">Delivery address</div><div style="margin-top:6px;font-size:13px;line-height:1.6;color:#334155"><strong>${escapeHtml(
    address.fullName
  )}</strong><br>${escapeHtml(address.addressLine)}<br>${escapeHtml(
    address.city
  )}, ${escapeHtml(address.state)} ${escapeHtml(
    address.pincode
  )}<br>${escapeHtml(address.phone)}</div></td></tr><tr><td style="padding-top:14px;font-size:13px;color:#64748b">Subtotal</td><td align="right" style="padding-top:14px;font-size:13px;color:#334155">${formatCurrency(
    order.subtotal
  )}</td></tr><tr><td style="padding-top:7px;font-size:13px;color:#64748b">Shipping</td><td align="right" style="padding-top:7px;font-size:13px;color:#334155">${formatCurrency(
    order.shippingFee
  )}</td></tr>${
    Number(order.discount) > 0
      ? `<tr><td style="padding-top:7px;font-size:13px;color:#047857">Discount</td><td align="right" style="padding-top:7px;font-size:13px;color:#047857">−${formatCurrency(
          order.discount
        )}</td></tr>`
      : ""
  }<tr><td style="padding-top:12px;border-top:1px solid #e2e8f0;font-size:15px;font-weight:700;color:#0f172a">Total</td><td align="right" style="padding-top:12px;border-top:1px solid #e2e8f0;font-size:15px;font-weight:700;color:#0f172a">${formatCurrency(
    order.total
  )}</td></tr></table><p style="margin:16px 0 0;font-size:12px;color:#64748b">Payment: ${escapeHtml(
    order.paymentMethod
  )} · ${escapeHtml(order.paymentStatus)}</p>`;
}

export async function sendVerificationEmail(user, token) {
  const verificationUrl = new URL(
    "/verify-email",
    `${getFrontendUrl()}/`
  );
  verificationUrl.searchParams.set("email", user.email);
  verificationUrl.searchParams.set("token", token);

  const html = renderEmail({
    preheader: "Verify your email to finish setting up your WeatherCart account.",
    eyebrow: "Account security",
    title: "Verify your email",
    intro: `Hi ${user.name}, confirm that this email address belongs to you.`,
    content:
      '<div style="border-radius:10px;background:#eff6ff;padding:16px;color:#1e3a8a;font-size:13px;line-height:1.6">This secure link expires in 24 hours. If you did not create a WeatherCart account, you can ignore this email.</div>',
    ctaUrl: verificationUrl.href,
    ctaLabel: "Verify email address",
  });

  await getTransporter().sendMail({
    from: getSender(),
    to: user.email,
    subject: "Verify your WeatherCart email",
    text: `Hi ${user.name}, verify your email using this link: ${verificationUrl.href}\nThis link expires in 24 hours.`,
    html,
  });
}

export async function sendPasswordResetEmail(user, token) {
  const resetUrl = new URL(
    "/reset-password",
    `${getFrontendUrl()}/`
  );
  resetUrl.searchParams.set("email", user.email);
  resetUrl.searchParams.set("token", token);

  const html = renderEmail({
    preheader: "Reset your WeatherCart account password.",
    eyebrow: "Account Security",
    title: "Reset your password",
    intro: `Hi ${user.name}, we received a request to reset your password.`,
    content:
      '<div style="border-radius:10px;background:#eff6ff;padding:16px;color:#1e3a8a;font-size:13px;line-height:1.6">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</div>',
    ctaUrl: resetUrl.href,
    ctaLabel: "Reset password",
  });

  await getTransporter().sendMail({
    from: getSender(),
    to: user.email,
    subject: "Reset your WeatherCart password",
    text: `Hi ${user.name},\n\nReset your password using this link: ${resetUrl.href}\n\nThis link expires in 1 hour. If you did not request this, please ignore this email.`,
    html,
  });
}

export async function sendOrderConfirmationEmail(user, order) {
  const orderUrl = `${getFrontendUrl()}/orders`;
  const html = renderEmail({
    preheader: `Order ${order.orderNumber} has been received.`,
    eyebrow: "Order received",
    title: "Thanks for your order",
    intro: `Hi ${user.name}, we have received your WeatherCart order.`,
    content: renderOrderDetails(order),
    ctaUrl: orderUrl,
    ctaLabel: "View my orders",
  });
  const itemLines = order.items
    .map(
      (item) =>
        `${item.name} × ${item.quantity} — ${formatCurrency(
          Number(item.price) * Number(item.quantity)
        )}`
    )
    .join("\n");

  await getTransporter().sendMail({
    from: getSender(),
    to: user.email,
    subject: `Order ${order.orderNumber} received — WeatherCart`,
    text: `Hi ${user.name},\n\nWe received your order ${order.orderNumber}.\n\n${itemLines}\n\nTotal: ${formatCurrency(
      order.total
    )}\nPayment: ${order.paymentMethod} (${order.paymentStatus})\n\nView your orders: ${orderUrl}`,
    html,
  });
}

export async function sendOrderStatusEmail(user, order, status) {
  const statusCopy = ORDER_STATUS_COPY[status];
  if (!statusCopy) {
    throw new Error(`No email template is configured for order status "${status}".`);
  }

  const orderUrl = `${getFrontendUrl()}/orders`;
  const html = renderEmail({
    preheader: `Update for order ${order.orderNumber}: ${statusCopy.title}.`,
    eyebrow: `Order update · ${status}`,
    title: statusCopy.title,
    intro: `Hi ${user.name}, ${statusCopy.message}`,
    content: renderOrderDetails(order),
    ctaUrl: orderUrl,
    ctaLabel: "Track my order",
  });

  await getTransporter().sendMail({
    from: getSender(),
    to: user.email,
    subject: `${statusCopy.title} — ${order.orderNumber}`,
    text: `Hi ${user.name},\n\n${statusCopy.message}\n\nOrder: ${
      order.orderNumber
    }\nStatus: ${status}\nTotal: ${formatCurrency(
      order.total
    )}\n\nView your orders: ${orderUrl}`,
    html,
  });
}
