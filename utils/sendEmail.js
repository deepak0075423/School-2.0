const transporter = require('../config/mailer');

const sendWelcomeEmail = async ({ to, name, email, tempPassword, role, schoolName }) => {
  const loginUrl = `${process.env.APP_URL}/auth/login`;
  const roleLabel = {
    super_admin: 'Super Admin',
    school_admin: 'School Admin',
    teacher: 'Teacher',
    student: 'Student',
    parent: 'Parent',
  }[role] || role;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Welcome to ${process.env.APP_NAME}</title>
<style>
  body { margin:0; padding:0; background:#0f1117; font-family:'Segoe UI',sans-serif; }
  .wrapper { max-width:600px; margin:40px auto; background:#1a1d2e; border-radius:16px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
  .header { background:linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding:40px 32px; text-align:center; }
  .header h1 { margin:0; color:#fff; font-size:28px; font-weight:700; letter-spacing:-0.5px; }
  .header p { margin:8px 0 0; color:rgba(255,255,255,0.8); font-size:14px; }
  .body { padding:36px 32px; }
  .greeting { color:#e2e8f0; font-size:18px; margin-bottom:24px; }
  .badge { display:inline-block; background:rgba(79,70,229,0.2); color:#a5b4fc; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; letter-spacing:0.5px; margin-bottom:20px; }
  .cred-box { background:#0f1117; border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:24px; margin:20px 0; }
  .cred-row { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06); }
  .cred-row:last-child { border-bottom:none; }
  .cred-label { color:#94a3b8; font-size:13px; }
  .cred-value { color:#e2e8f0; font-size:14px; font-weight:600; font-family:monospace; }
  .login-btn { display:block; text-align:center; background:linear-gradient(135deg, #4f46e5, #7c3aed); color:#fff; text-decoration:none; padding:14px 32px; border-radius:10px; font-size:15px; font-weight:600; margin:28px 0; }
  .warning { background:rgba(245,158,11,0.1); border-left:4px solid #f59e0b; border-radius:0 8px 8px 0; padding:14px 18px; color:#fbbf24; font-size:13px; margin-bottom:20px; }
  .steps { color:#94a3b8; font-size:13px; line-height:1.8; }
  .steps ol { padding-left:20px; margin:12px 0; }
  .footer { background:#0f1117; padding:24px 32px; text-align:center; }
  .footer p { color:#475569; font-size:12px; margin:0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>🎓 ${process.env.APP_NAME}</h1>
    <p>${schoolName || 'Welcome to the platform'}</p>
  </div>
  <div class="body">
    <div class="badge">${roleLabel}</div>
    <div class="greeting">Hello, <strong style="color:#a5b4fc">${name}</strong>! 👋</div>
    <p style="color:#94a3b8; font-size:14px; margin-bottom:20px;">Your account has been successfully created. Here are your login credentials:</p>
    
    <div class="cred-box">
      <div class="cred-row">
        <span class="cred-label">📧 Email / Username</span>
        <span class="cred-value">${email}</span>
      </div>
      <div class="cred-row">
        <span class="cred-label">🔑 Temporary Password</span>
        <span class="cred-value">${tempPassword}</span>
      </div>
      ${schoolName ? `<div class="cred-row"><span class="cred-label">🏫 School</span><span class="cred-value">${schoolName}</span></div>` : ''}
      <div class="cred-row">
        <span class="cred-label">👤 Role</span>
        <span class="cred-value">${roleLabel}</span>
      </div>
    </div>

    <div class="warning">
      ⚠️ <strong>Security Notice:</strong> You will be required to set a new password on your first login. Please do not share your temporary password with anyone.
    </div>

    <a href="${loginUrl}" class="login-btn">🚀 Login to Your Dashboard</a>

    <div class="steps">
      <strong style="color:#e2e8f0;">First Login Instructions:</strong>
      <ol>
        <li>Click the login button above or visit: <span style="color:#a5b4fc">${loginUrl}</span></li>
        <li>Enter your email and temporary password</li>
        <li>Create a new secure password</li>
        <li>Access your ${roleLabel} dashboard</li>
      </ol>
    </div>
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} ${process.env.APP_NAME} — This is an automated message, please do not reply.</p>
  </div>
</div>
</body>
</html>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: `Welcome to ${process.env.APP_NAME} — Your Login Credentials`,
      html,
    });
    console.log(`📧 Welcome email sent to ${to}`);
  } catch (err) {
    console.error(`❌ Email failed for ${to}:`, err.message);
  }
};

const sendOtpEmail = async ({ to, name, otp }) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Password Reset OTP</title>
<style>
  body { margin:0; padding:0; background:#f0f4ff; font-family:'Segoe UI',sans-serif; }
  .wrapper { max-width:520px; margin:40px auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 40px rgba(79,70,229,0.12); }
  .header { background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%); padding:36px 32px; text-align:center; }
  .header h1 { margin:0; color:#fff; font-size:24px; font-weight:700; }
  .header p { margin:8px 0 0; color:rgba(255,255,255,0.8); font-size:13px; }
  .body { padding:36px 32px; }
  .greeting { color:#374151; font-size:16px; margin-bottom:24px; }
  .otp-box { background:#eef2ff; border:2px dashed #c7d2fe; border-radius:12px; padding:28px; text-align:center; margin:20px 0; }
  .otp-code { font-size:42px; font-weight:900; letter-spacing:10px; color:#4f46e5; font-family:monospace; }
  .otp-label { font-size:13px; color:#6b7280; margin-top:8px; }
  .warning { background:#fffbeb; border-left:4px solid #f59e0b; border-radius:0 8px 8px 0; padding:14px 18px; color:#92400e; font-size:13px; margin:20px 0; }
  .footer { background:#f9fafb; border-top:1px solid #e5e7eb; padding:20px 32px; text-align:center; }
  .footer p { color:#9ca3af; font-size:12px; margin:0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>🎓 ${process.env.APP_NAME}</h1>
    <p>Password Reset Request</p>
  </div>
  <div class="body">
    <div class="greeting">Hello, <strong>${name}</strong>! 👋</div>
    <p style="color:#4b5563; font-size:14px;">We received a request to reset your password. Use the OTP below to verify your identity. This code is valid for <strong>10 minutes</strong>.</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <div class="otp-label">One-Time Password (OTP)</div>
    </div>
    <div class="warning">
      ⏱️ <strong>This OTP expires in 10 minutes.</strong><br/>
      If you didn't request a password reset, you can safely ignore this email.
    </div>
    <p style="color:#6b7280; font-size:13px;">For security, never share this OTP with anyone. Our team will never ask for it.</p>
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} ${process.env.APP_NAME} — Automated security email.</p>
  </div>
</div>
</body>
</html>
    `;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: `${otp} is your ${process.env.APP_NAME} password reset OTP`,
      html,
    });
    console.log(`📧 OTP email sent to ${to}`);
  } catch (err) {
    console.error(`❌ OTP email failed for ${to}:`, err.message);
    throw err; // OTP emails are fatal — surface the error
  }
};

module.exports = { sendWelcomeEmail, sendOtpEmail };
