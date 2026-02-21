const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      minlength: [2, 'Group name must be at least 2 characters'],
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    // The user who creates the group — becomes the Group Admin (Creator)
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Regular members (does NOT include admin — admin is separate)
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Trip planning fields — only editable by admin
    destination: {
      type: String,
      default: '',
      trim: true,
    },
    tripBudget: {
      type: Number,
      default: 0,
      min: 0,
    },
    tripDates: {
      start: { type: Date, default: null },
      end:   { type: Date, default: null },
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Group', groupSchema);
