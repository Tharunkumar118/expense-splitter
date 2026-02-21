const express = require('express');
const Expense = require('../models/Expense');
const Group   = require('../models/Group');
const { authenticate, isGroupMember } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/expenses/group/:groupId ─────────────────────────────────────────
// List all expenses for a group — any group member can view
router.get('/group/:groupId', authenticate, isGroupMember, async (req, res) => {
  try {
    const expenses = await Expense.find({ group: req.params.groupId })
      .populate('paidBy',      'name email')
      .populate('participants', 'name email')
      .populate('enteredBy',   'name email')
      .sort({ date: -1 });

    res.json({ expenses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/expenses ───────────────────────────────────────────────────────
// Add a new expense — any group member can add
// AUDIT TRAIL: enteredBy is always set to the logged-in user (cannot be faked)
router.post('/', authenticate, async (req, res) => {
  try {
    const { groupId, description, amount, paidBy, participants, category, date } = req.body;

    // Validate required fields
    if (!groupId)        return res.status(400).json({ message: 'groupId is required.' });
    if (!description)    return res.status(400).json({ message: 'Description is required.' });
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Amount must be greater than 0.' });
    if (!paidBy)         return res.status(400).json({ message: 'paidBy is required.' });
    if (!participants || participants.length === 0) {
      return res.status(400).json({ message: 'At least one participant is required.' });
    }

    // Verify the requester is a group member
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const userId   = req.user._id.toString();
    const isAdmin  = group.admin.toString() === userId;
    const isMember = group.members.some((m) => m.toString() === userId);

    if (!isAdmin && !isMember) {
      return res.status(403).json({ message: 'You are not a member of this group.' });
    }

    // Create expense — enteredBy is locked to the current logged-in user
    const expense = await Expense.create({
      group:        groupId,
      description:  description.trim(),
      amount:       parseFloat(amount),
      paidBy,
      participants,
      category:     category || 'Other',
      enteredBy:    req.user._id,  // ← AUDIT TRAIL: always the current user
      date:         date ? new Date(date) : new Date(),
    });

    await expense.populate('paidBy',      'name email');
    await expense.populate('participants', 'name email');
    await expense.populate('enteredBy',   'name email');

    res.status(201).json({ expense });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/expenses/:id ─────────────────────────────────────────────────
// Delete an expense — only the person who entered it OR the group admin can delete
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id).populate('group');
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found.' });
    }

    const userId    = req.user._id.toString();
    const isEnterer = expense.enteredBy.toString() === userId;
    const isAdmin   = expense.group.admin.toString() === userId;

    if (!isEnterer && !isAdmin) {
      return res.status(403).json({
        message: 'You can only delete expenses you entered (or be the group admin).',
      });
    }

    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: 'Expense deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
