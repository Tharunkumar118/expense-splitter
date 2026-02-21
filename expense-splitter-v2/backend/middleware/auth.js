const jwt   = require('jsonwebtoken');
const User  = require('../models/User');
const Group = require('../models/Group');

// ── Middleware 1: Verify JWT token ───────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided. Please login.' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired. Please login again.' });
    }
    return res.status(401).json({ message: 'Invalid token.' });
  }
};

// ── Middleware 2: Check if user is the Group Admin (Creator) ─────────────────
// RBAC — only the admin can access admin-only routes
const isGroupAdmin = async (req, res, next) => {
  try {
    const groupId = req.params.groupId || req.params.id || req.body.groupId;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    if (group.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: 'Access denied. Only the Group Admin can perform this action.',
      });
    }

    req.group = group; // attach for reuse
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Middleware 3: Check if user is a member OR admin of the group ─────────────
const isGroupMember = async (req, res, next) => {
  try {
    const groupId = req.params.groupId || req.params.id || req.body.groupId;
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found.' });
    }

    const userId   = req.user._id.toString();
    const isAdmin  = group.admin.toString() === userId;
    const isMember = group.members.some((m) => m.toString() === userId);

    if (!isAdmin && !isMember) {
      return res.status(403).json({
        message: 'Access denied. You are not a member of this group.',
      });
    }

    req.group   = group;
    req.isAdmin = isAdmin;
    next();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { authenticate, isGroupAdmin, isGroupMember };
