const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const AdminConfig = require('../models/AdminConfig');
const { sendStatusEmail } = require('../services/emailService');

// Admin login (password check)
router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'dogh_appt';

  if (password === adminPassword) {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// Middleware to verify admin password in header
const verifyAdmin = (req, res, next) => {
  const adminPassword = req.headers['x-admin-password'];
  if (adminPassword !== (process.env.ADMIN_PASSWORD || 'dogh_appt')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Get all appointments (admin)
router.get('/appointments', verifyAdmin, async (req, res) => {
  try {
    const { status, room, date } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (room) filter.room = room;
    if (date) filter.date = date;

    const appointments = await Appointment.find(filter).sort({ createdAt: -1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get dashboard stats
router.get('/dashboard', verifyAdmin, async (req, res) => {
  try {
    const total = await Appointment.countDocuments();
    const pending = await Appointment.countDocuments({ status: 'pending' });
    const approved = await Appointment.countDocuments({ status: 'approved' });
    const declined = await Appointment.countDocuments({ status: 'declined' });

    const todayStr = new Date().toISOString().split('T')[0];
    const todayAppointments = await Appointment.countDocuments({
      date: todayStr,
      status: 'approved'
    });

    const abConference = await Appointment.countDocuments({
      room: 'AB Conference Room',
      status: 'approved'
    });
    const malasakit = await Appointment.countDocuments({
      room: 'Malasakit Lobby',
      status: 'approved'
    });

    res.json({
      total,
      pending,
      approved,
      declined,
      todayAppointments,
      roomStats: {
        'AB Conference Room': abConference,
        'Malasakit Lobby': malasakit
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update appointment status (approve/decline)
router.patch('/appointments/:id', verifyAdmin, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    if (status && !['pending', 'approved', 'declined'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // If approving, check for overlapping conflicts
    if (status === 'approved') {
      const appointment = await Appointment.findById(req.params.id);
      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }

      const approvedAppointments = await Appointment.find({
        _id: { $ne: req.params.id },
        room: appointment.room,
        date: appointment.date,
        status: 'approved'
      });

      const timeToMin = (timeStr) => {
        const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (!match) return 0;
        let h = parseInt(match[1]);
        const m = parseInt(match[2]);
        const p = match[3].toUpperCase();
        if (p === 'PM' && h !== 12) h += 12;
        if (p === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      };

      const newStart = timeToMin(appointment.timeStart);
      const newEnd = timeToMin(appointment.timeEnd);

      const conflict = approvedAppointments.find(appt => {
        const existStart = timeToMin(appt.timeStart);
        const existEnd = timeToMin(appt.timeEnd);
        return newStart < existEnd && newEnd > existStart;
      });

      if (conflict) {
        return res.status(409).json({
          error: `This overlaps with an approved booking (${conflict.timeStart} - ${conflict.timeEnd}).`
        });
      }
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Send email notification to booker on approval/decline
    if (status === 'approved' || status === 'declined') {
      sendStatusEmail(appointment, status);
    }

    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete appointment
router.delete('/appointments/:id', verifyAdmin, async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    res.json({ message: 'Appointment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== Settings Routes =====

// Get admin notification emails
router.get('/settings/admin-emails', verifyAdmin, async (req, res) => {
  try {
    const config = await AdminConfig.findOne({ key: 'admin_emails' });
    res.json({ emails: config ? config.value : [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update admin notification emails
router.put('/settings/admin-emails', verifyAdmin, async (req, res) => {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails)) {
      return res.status(400).json({ error: 'Emails must be an array' });
    }

    const config = await AdminConfig.findOneAndUpdate(
      { key: 'admin_emails' },
      { key: 'admin_emails', value: emails },
      { upsert: true, new: true }
    );

    res.json({ emails: config.value });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get request limit settings
router.get('/settings/request-limit', verifyAdmin, async (req, res) => {
  try {
    const config = await AdminConfig.findOne({ key: 'request_limit' });
    res.json(config ? config.value : { enabled: false, maxRequests: 3 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update request limit settings
router.put('/settings/request-limit', verifyAdmin, async (req, res) => {
  try {
    const { enabled, maxRequests } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean' });
    }
    if (enabled && (!Number.isInteger(maxRequests) || maxRequests < 1)) {
      return res.status(400).json({ error: 'maxRequests must be a positive integer' });
    }

    const value = { enabled, maxRequests: enabled ? maxRequests : 3 };
    const config = await AdminConfig.findOneAndUpdate(
      { key: 'request_limit' },
      { key: 'request_limit', value },
      { upsert: true, new: true }
    );

    res.json(config.value);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
