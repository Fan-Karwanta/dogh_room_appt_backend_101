const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const AdminConfig = require('../models/AdminConfig');
const { appointmentLimiter } = require('../middleware/rateLimiter');
const { sendNewRequestEmailToAdmins } = require('../services/emailService');

// Helper to get request limit settings from DB
const getRequestLimitConfig = async () => {
  const config = await AdminConfig.findOne({ key: 'request_limit' });
  return config ? config.value : { enabled: false, maxRequests: 3 };
};

// Get all appointments (approved only for public)
router.get('/', async (req, res) => {
  try {
    const { room, status, deviceId } = req.query;
    const filter = {};
    if (room) filter.room = room;
    if (status) filter.status = status;
    if (deviceId) filter.deviceId = deviceId;

    const appointments = await Appointment.find(filter).sort({ date: 1, timeStart: 1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get approved appointments for public calendar
router.get('/approved', async (req, res) => {
  try {
    const appointments = await Appointment.find({ status: 'approved' }).sort({ date: 1, timeStart: 1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get booked time ranges for a specific room and date
router.get('/available-slots', async (req, res) => {
  try {
    const { room, date } = req.query;
    if (!room || !date) {
      return res.status(400).json({ error: 'Room and date are required' });
    }

    // Find approved appointments for this room and date
    const bookedAppointments = await Appointment.find({
      room,
      date,
      status: 'approved'
    });

    const bookedRanges = bookedAppointments.map(a => ({
      start: a.timeStart,
      end: a.timeEnd,
      bookerName: a.bookerName
    }));

    res.json({ bookedRanges });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper to convert time string to minutes for comparison
const timeToMinutes = (timeStr) => {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

// Create a new appointment
router.post('/', appointmentLimiter, async (req, res) => {
  try {
    const { room, reason, bookerName, bookerEmail, date, timeStart, timeEnd, deviceId } = req.body;

    if (!room || !reason || !bookerName || !bookerEmail || !date || !timeStart || !timeEnd || !deviceId) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check weekly limit (configurable via admin settings)
    const limitConfig = await getRequestLimitConfig();
    if (limitConfig.enabled) {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const weeklyCount = await Appointment.countDocuments({
        deviceId,
        createdAt: { $gte: startOfWeek, $lt: endOfWeek }
      });

      if (weeklyCount >= limitConfig.maxRequests) {
        return res.status(429).json({
          error: `You have reached the maximum of ${limitConfig.maxRequests} appointment request(s) per week. Please try again next week.`
        });
      }
    }

    // Check for overlapping approved appointments
    const approvedAppointments = await Appointment.find({
      room,
      date,
      status: 'approved'
    });

    const newStart = timeToMinutes(timeStart);
    const newEnd = timeToMinutes(timeEnd);

    const conflict = approvedAppointments.find(appt => {
      const existStart = timeToMinutes(appt.timeStart);
      const existEnd = timeToMinutes(appt.timeEnd);
      return newStart < existEnd && newEnd > existStart;
    });

    if (conflict) {
      return res.status(409).json({
        error: `This time overlaps with an approved booking (${conflict.timeStart} - ${conflict.timeEnd}). Please choose a different time.`
      });
    }

    const appointment = new Appointment({
      room,
      reason,
      bookerName,
      bookerEmail,
      date,
      timeStart,
      timeEnd,
      deviceId
    });

    await appointment.save();

    // Send notification email to admin emails (async, don't block response)
    sendNewRequestEmailToAdmins(appointment);

    res.status(201).json(appointment);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Cancel own pending appointment (user action)
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Verify ownership
    if (appointment.deviceId !== deviceId) {
      return res.status(403).json({ error: 'You can only cancel your own appointments' });
    }

    // Only allow cancelling pending appointments
    if (appointment.status !== 'pending') {
      return res.status(400).json({ error: `Cannot cancel an appointment that is already ${appointment.status}. Please contact the administrator for assistance.` });
    }

    appointment.previousStatus = appointment.status;
    appointment.status = 'cancelled';
    appointment.cancelledAt = new Date();
    appointment.cancellationReason = 'Cancelled by user';
    await appointment.save();

    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get appointment by ID
router.get('/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Check weekly limit for a device
router.get('/check-limit/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limitConfig = await getRequestLimitConfig();

    if (!limitConfig.enabled) {
      return res.json({ enabled: false, count: 0, remaining: null, maxRequests: null });
    }

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const weeklyCount = await Appointment.countDocuments({
      deviceId,
      createdAt: { $gte: startOfWeek, $lt: endOfWeek }
    });

    res.json({
      enabled: true,
      count: weeklyCount,
      remaining: Math.max(0, limitConfig.maxRequests - weeklyCount),
      maxRequests: limitConfig.maxRequests
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
