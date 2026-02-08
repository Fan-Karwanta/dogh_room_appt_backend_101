const nodemailer = require('nodemailer');
const AdminConfig = require('../models/AdminConfig');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// Verify transporter on startup
transporter.verify().then(() => {
  console.log('Email service ready');
}).catch((err) => {
  console.error('Email service error:', err.message);
});

const formatDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

// Send email to booker when appointment is approved/declined
const sendStatusEmail = async (appointment, status) => {
  if (!appointment.bookerEmail) return;

  const isApproved = status === 'approved';
  const statusText = isApproved ? 'Approved' : 'Declined';
  const statusColor = isApproved ? '#16a34a' : '#dc2626';
  const statusEmoji = isApproved ? '✅' : '❌';

  const subject = `${statusEmoji} Appointment ${statusText} - DOGH Room Appointment System`;

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
      <div style="background: linear-gradient(135deg, #1e40af, #2563eb); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 22px;">DOGH Room Appointment System</h1>
        <p style="color: #bfdbfe; margin: 5px 0 0 0; font-size: 14px;">Davao Occidental General Hospital</p>
      </div>
      <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="display: inline-block; background: ${isApproved ? '#f0fdf4' : '#fef2f2'}; color: ${statusColor}; padding: 8px 20px; border-radius: 20px; font-weight: 600; font-size: 16px; border: 1px solid ${isApproved ? '#bbf7d0' : '#fecaca'};">
            ${statusEmoji} Appointment ${statusText}
          </span>
        </div>
        <p style="color: #374151; font-size: 15px; margin-bottom: 20px;">
          Dear <strong>${appointment.bookerName}</strong>,
        </p>
        <p style="color: #374151; font-size: 15px; margin-bottom: 20px;">
          Your appointment request has been <strong style="color: ${statusColor};">${statusText.toLowerCase()}</strong> by the administrator.
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h3 style="color: #1e40af; margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Appointment Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 100px;">Room:</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${appointment.room}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Date:</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${formatDate(appointment.date)}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Time:</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${appointment.timeStart} - ${appointment.timeEnd}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Reason:</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${appointment.reason}</td>
            </tr>
          </table>
        </div>
        ${appointment.adminNotes ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="color: #92400e; font-size: 13px; font-weight: 600; margin: 0 0 4px 0;">Admin Notes:</p>
          <p style="color: #78350f; font-size: 14px; margin: 0;">${appointment.adminNotes}</p>
        </div>
        ` : ''}
        <p style="color: #6b7280; font-size: 13px; text-align: center; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          This is an automated message from the DOGH Room Appointment System.<br>
          Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"DOGH Room Appointment" <${process.env.GMAIL_USER}>`,
      to: appointment.bookerEmail,
      subject,
      html
    });
    console.log(`Status email sent to ${appointment.bookerEmail} (${status})`);
  } catch (err) {
    console.error('Failed to send status email:', err.message);
  }
};

// Send email to admin emails when a new appointment is requested
const sendNewRequestEmailToAdmins = async (appointment) => {
  try {
    const config = await AdminConfig.findOne({ key: 'admin_emails' });
    if (!config || !config.value || config.value.length === 0) return;

    const adminEmails = config.value;
    const subject = `📋 New Appointment Request - ${appointment.room}`;

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e40af, #2563eb); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">DOGH Room Appointment System</h1>
          <p style="color: #bfdbfe; margin: 5px 0 0 0; font-size: 14px;">New Appointment Request</p>
        </div>
        <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="display: inline-block; background: #fefce8; color: #a16207; padding: 8px 20px; border-radius: 20px; font-weight: 600; font-size: 16px; border: 1px solid #fde68a;">
              📋 New Request - Pending Review
            </span>
          </div>
          <p style="color: #374151; font-size: 15px; margin-bottom: 20px;">
            A new appointment request has been submitted and requires your review.
          </p>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #1e40af; margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Request Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 100px;">Booker:</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${appointment.bookerName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Email:</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${appointment.bookerEmail}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Room:</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${appointment.room}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Date:</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${formatDate(appointment.date)}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Time:</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${appointment.timeStart} - ${appointment.timeEnd}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 14px;">Reason:</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 500;">${appointment.reason}</td>
              </tr>
            </table>
          </div>
          <p style="color: #374151; font-size: 14px; text-align: center;">
            Please log in to the admin panel to approve or decline this request.
          </p>
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
            This is an automated message from the DOGH Room Appointment System.
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"DOGH Room Appointment" <${process.env.GMAIL_USER}>`,
      to: adminEmails.join(', '),
      subject,
      html
    });
    console.log(`New request email sent to admins: ${adminEmails.join(', ')}`);
  } catch (err) {
    console.error('Failed to send admin notification email:', err.message);
  }
};

module.exports = { sendStatusEmail, sendNewRequestEmailToAdmins };
