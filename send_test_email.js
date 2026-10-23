import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config({ path: './.env' });

// Use admin email (or any address you can check)
const EMAIL = process.env.ADMIN_USERNAME || 'admin@weathercart.com';

async function sendTest() {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: EMAIL,
      subject: 'WeatherCart test email',
      text: 'This is a test email from your WeatherCart backend to verify SMTP configuration.',
      html: `<p>This is a <strong>test email</strong> from your WeatherCart backend to verify SMTP configuration.</p>`,
    });
    console.log('✅ Test email sent! Message ID:', info.messageId);
  } catch (err) {
    console.error('❌ Failed to send test email:', err.message);
    console.error(err);
  }
}

sendTest();
