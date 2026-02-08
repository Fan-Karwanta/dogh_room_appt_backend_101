const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  room: {
    type: String,
    required: true,
    enum: ['AB Conference Room', 'Malasakit Lobby']
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  bookerName: {
    type: String,
    required: true,
    trim: true
  },
  bookerEmail: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: String,
    required: true
  },
  timeStart: {
    type: String,
    required: true
  },
  timeEnd: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'declined'],
    default: 'pending'
  },
  deviceId: {
    type: String,
    required: true
  },
  adminNotes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Appointment', appointmentSchema);
