const https = require('https');
const AdminConfig = require('../models/AdminConfig');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@dogh-appointments.com';
const SENDER_NAME = 'DOGH Room Appointment';

// Direct HTTPS helper for Brevo API (no SDK, works on all Node.js versions)
const brevoRequest = (method, path, body) => {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.brevo.com',
      port: 443,
      path: `/v3${path}`,
      method,
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
    };
    if (data) options.headers['content-length'] = Buffer.byteLength(data);

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(responseBody)); } catch { resolve(responseBody); }
        } else {
          reject(new Error(`Brevo API ${res.statusCode}: ${responseBody}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
};

// Verify Brevo API on startup
(async () => {
  try {
    const account = await brevoRequest('GET', '/account');
    console.log(`Brevo email service ready (${account.email})`);
  } catch (err) {
    console.error('Brevo email service error:', err.message || err);
  }
})();

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

// Improved email template builder
const buildEmailHtml = ({ headerSubtitle, badgeBg, badgeColor, badgeBorder, badgeText, bodyContent, footerText }) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DOGH Room Appointment</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #2563eb 100%); padding: 40px 32px; border-radius: 16px 16px 0 0; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 8px;">
                    <div style="width: 56px; height: 56px; background: rgba(255,255,255,0.15); border-radius: 14px; display: inline-block; line-height: 56px; font-size: 28px;">&#127975;</div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">DOGH Room Appointment</h1>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 6px;">
                    <p style="color: #93c5fd; margin: 0; font-size: 14px; font-weight: 400;">${headerSubtitle}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background: #ffffff; padding: 36px 32px 32px; border-left: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">
              <!-- Status Badge -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom: 28px;">
                    <span style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; padding: 10px 24px; border-radius: 24px; font-weight: 600; font-size: 15px; border: 1px solid ${badgeBorder}; letter-spacing: 0.2px;">
                      ${badgeText}
                    </span>
                  </td>
                </tr>
              </table>
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 24px 32px; border-radius: 0 0 16px 16px; border: 1px solid #e2e8f0; border-top: none;">
              <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0; line-height: 1.6;">
                ${footerText}<br>
                Davao Occidental General Hospital &bull; Room Appointment System
              </p>
            </td>
          </tr>
          <!-- Branding -->
          <tr>
            <td align="center" style="padding-top: 20px;">
              <p style="color: #cbd5e1; font-size: 11px; margin: 0;">Powered by DOGH Appointment System</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const buildDetailsTable = (rows) => {
  const rowsHtml = rows.map(({ label, value }) => `
    <tr>
      <td style="padding: 10px 12px; color: #64748b; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; width: 110px; vertical-align: top; border-bottom: 1px solid #f1f5f9;">${label}</td>
      <td style="padding: 10px 12px; color: #1e293b; font-size: 14px; font-weight: 500; border-bottom: 1px solid #f1f5f9;">${value}</td>
    </tr>`).join('');

  return `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
      <div style="background: #1e3a5f; padding: 12px 16px;">
        <h3 style="color: #ffffff; margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Appointment Details</h3>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rowsHtml}
      </table>
    </div>`;
};

// Send email to booker when appointment is approved/declined
const sendStatusEmail = async (appointment, status) => {
  if (!appointment.bookerEmail) return;

  const isApproved = status === 'approved';
  const statusText = isApproved ? 'Approved' : 'Declined';
  const statusColor = isApproved ? '#15803d' : '#dc2626';
  const badgeBg = isApproved ? '#f0fdf4' : '#fef2f2';
  const badgeBorder = isApproved ? '#86efac' : '#fca5a5';
  const statusIcon = isApproved ? '&#10003;' : '&#10007;';

  const subject = `Appointment ${statusText} - DOGH Room Appointment System`;

  const detailsTable = buildDetailsTable([
    { label: 'Room', value: appointment.room },
    { label: 'Date', value: formatDate(appointment.date) },
    { label: 'Time', value: `${appointment.timeStart} &ndash; ${appointment.timeEnd}` },
    { label: 'Reason', value: appointment.reason }
  ]);

  const adminNotesHtml = appointment.adminNotes ? `
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
      <p style="color: #92400e; font-size: 12px; font-weight: 600; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px;">Admin Notes</p>
      <p style="color: #78350f; font-size: 14px; margin: 0; line-height: 1.5;">${appointment.adminNotes}</p>
    </div>` : '';

  const bodyContent = `
    <p style="color: #334155; font-size: 15px; margin: 0 0 8px 0; line-height: 1.6;">
      Dear <strong style="color: #0f172a;">${appointment.bookerName}</strong>,
    </p>
    <p style="color: #334155; font-size: 15px; margin: 0 0 28px 0; line-height: 1.6;">
      Your appointment request has been <strong style="color: ${statusColor};">${statusText.toLowerCase()}</strong> by the administrator.
    </p>
    ${detailsTable}
    ${adminNotesHtml}
    ${isApproved ? `
    <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 16px 20px; margin-bottom: 8px;">
      <p style="color: #15803d; font-size: 14px; margin: 0; line-height: 1.5;">
        <strong>Next steps:</strong> Please arrive at least 5 minutes before your scheduled time. If you need to cancel, please contact the administrator.
      </p>
    </div>` : `
    <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 10px; padding: 16px 20px; margin-bottom: 8px;">
      <p style="color: #dc2626; font-size: 14px; margin: 0; line-height: 1.5;">
        You may submit a new appointment request with a different date or time.
      </p>
    </div>`}`;

  const html = buildEmailHtml({
    headerSubtitle: 'Davao Occidental General Hospital',
    badgeBg,
    badgeColor: statusColor,
    badgeBorder,
    badgeText: `${statusIcon} Appointment ${statusText}`,
    bodyContent,
    footerText: 'This is an automated message. Please do not reply to this email.'
  });

  try {
    await brevoRequest('POST', '/smtp/email', {
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: appointment.bookerEmail, name: appointment.bookerName }],
      subject,
      htmlContent: html,
    });
    console.log(`Status email sent to ${appointment.bookerEmail} (${status})`);
  } catch (err) {
    console.error('Failed to send status email:', err.message || err);
  }
};

// Send email to admin emails when a new appointment is requested
const sendNewRequestEmailToAdmins = async (appointment) => {
  try {
    const config = await AdminConfig.findOne({ key: 'admin_emails' });
    if (!config || !config.value || config.value.length === 0) return;

    const adminEmails = config.value;
    const subject = `New Appointment Request - ${appointment.room}`;

    const detailsTable = buildDetailsTable([
      { label: 'Booker', value: appointment.bookerName },
      { label: 'Email', value: appointment.bookerEmail },
      { label: 'Room', value: appointment.room },
      { label: 'Date', value: formatDate(appointment.date) },
      { label: 'Time', value: `${appointment.timeStart} &ndash; ${appointment.timeEnd}` },
      { label: 'Reason', value: appointment.reason }
    ]);

    const bodyContent = `
      <p style="color: #334155; font-size: 15px; margin: 0 0 28px 0; line-height: 1.6;">
        A new appointment request has been submitted and requires your review.
      </p>
      ${detailsTable}
      <div style="text-align: center; margin-top: 28px;">
        <p style="color: #475569; font-size: 14px; margin: 0;">
          Please log in to the <strong>Admin Panel</strong> to approve or decline this request.
        </p>
      </div>`;

    const html = buildEmailHtml({
      headerSubtitle: 'New Appointment Request',
      badgeBg: '#fefce8',
      badgeColor: '#a16207',
      badgeBorder: '#fde68a',
      badgeText: '&#128203; New Request &ndash; Pending Review',
      bodyContent,
      footerText: 'This is an automated admin notification.'
    });

    await brevoRequest('POST', '/smtp/email', {
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: adminEmails.map(email => ({ email })),
      subject,
      htmlContent: html,
    });
    console.log(`New request email sent to admins: ${adminEmails.join(', ')}`);
  } catch (err) {
    console.error('Failed to send admin notification email:', err.message || err);
  }
};

// Send email to booker when appointment is cancelled by admin
const sendCancellationEmail = async (appointment) => {
  if (!appointment.bookerEmail) return;

  const subject = `Appointment Cancelled - DOGH Room Appointment System`;

  const detailsTable = buildDetailsTable([
    { label: 'Room', value: appointment.room },
    { label: 'Date', value: formatDate(appointment.date) },
    { label: 'Time', value: `${appointment.timeStart} &ndash; ${appointment.timeEnd}` },
    { label: 'Reason', value: appointment.reason },
    { label: 'Previous Status', value: `<span style="text-transform: capitalize;">${appointment.previousStatus}</span>` }
  ]);

  const cancellationReasonHtml = appointment.cancellationReason ? `
    <div style="background: #fef2f2; border: 1px solid #fca5a5; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
      <p style="color: #991b1b; font-size: 12px; font-weight: 600; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px;">Reason for Cancellation</p>
      <p style="color: #7f1d1d; font-size: 14px; margin: 0; line-height: 1.5;">${appointment.cancellationReason}</p>
    </div>` : '';

  const adminNotesHtml = appointment.adminNotes ? `
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
      <p style="color: #92400e; font-size: 12px; font-weight: 600; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px;">Admin Notes</p>
      <p style="color: #78350f; font-size: 14px; margin: 0; line-height: 1.5;">${appointment.adminNotes}</p>
    </div>` : '';

  const bodyContent = `
    <p style="color: #334155; font-size: 15px; margin: 0 0 8px 0; line-height: 1.6;">
      Dear <strong style="color: #0f172a;">${appointment.bookerName}</strong>,
    </p>
    <p style="color: #334155; font-size: 15px; margin: 0 0 28px 0; line-height: 1.6;">
      Your appointment has been <strong style="color: #dc2626;">cancelled</strong> by the administrator.
    </p>
    ${detailsTable}
    ${cancellationReasonHtml}
    ${adminNotesHtml}
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin-bottom: 8px;">
      <p style="color: #475569; font-size: 14px; margin: 0; line-height: 1.5;">
        The time slot is now available again. You may submit a new appointment request if needed.
      </p>
    </div>`;

  const html = buildEmailHtml({
    headerSubtitle: 'Davao Occidental General Hospital',
    badgeBg: '#fef2f2',
    badgeColor: '#dc2626',
    badgeBorder: '#fca5a5',
    badgeText: '&#10007; Appointment Cancelled',
    bodyContent,
    footerText: 'This is an automated message. Please do not reply to this email.'
  });

  try {
    await brevoRequest('POST', '/smtp/email', {
      sender: { name: SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: appointment.bookerEmail, name: appointment.bookerName }],
      subject,
      htmlContent: html,
    });
    console.log(`Cancellation email sent to ${appointment.bookerEmail}`);
  } catch (err) {
    console.error('Failed to send cancellation email:', err.message || err);
  }
};

module.exports = { sendStatusEmail, sendNewRequestEmailToAdmins, sendCancellationEmail };
