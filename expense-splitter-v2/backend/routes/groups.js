const express = require('express');
const Group   = require('../models/Group');
const User    = require('../models/User');
const Expense = require('../models/Expense');
const { authenticate, isGroupAdmin, isGroupMember } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/groups ──────────────────────────────────────────────────────────
// Get all groups where current user is admin OR member
router.get('/', authenticate, async (req, res) => {
  try {
    const groups = await Group.find({
      $or: [{ admin: req.user._id }, { members: req.user._id }],
    })
      .populate('admin', 'name email')
      .populate('members', 'name email')
      .sort({ createdAt: -1 });

    res.json({ groups });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/groups ─────────────────────────────────────────────────────────
// Create a group — the creator automatically becomes ADMIN
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, currency } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required.' });
    }

    const group = await Group.create({
      name:        name.trim(),
      description: description?.trim() || '',
      currency:    currency || 'USD',
      admin:       req.user._id,   // ← creator becomes admin
      members:     [],
    });

    await group.populate('admin', 'name email');

    res.status(201).json({ group });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/groups/:id ──────────────────────────────────────────────────────
// Get single group — members and admin can both view
router.get('/:id', authenticate, isGroupMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('admin', 'name email')
      .populate('members', 'name email');

    res.json({
      group,
      isAdmin: req.isAdmin,  // tells frontend the current user's role
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/groups/:id ──────────────────────────────────────────────────────
// Update group + trip planning — ADMIN ONLY
router.put('/:id', authenticate, isGroupAdmin, async (req, res) => {
  try {
    const { name, description, destination, currency, tripBudget, tripDates } = req.body;

    const group = await Group.findByIdAndUpdate(
      req.params.id,
      {
        name:        name?.trim(),
        description: description?.trim(),
        destination: destination?.trim(),
        currency,
        tripBudget:  parseFloat(tripBudget) || 0,
        tripDates:   tripDates || { start: null, end: null },
      },
      { new: true, runValidators: true }
    )
      .populate('admin', 'name email')
      .populate('members', 'name email');

    res.json({ group });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/groups/:id ───────────────────────────────────────────────────
// Delete group and all its expenses — ADMIN ONLY
router.delete('/:id', authenticate, isGroupAdmin, async (req, res) => {
  try {
    await Expense.deleteMany({ group: req.params.id }); // cleanup expenses first
    await Group.findByIdAndDelete(req.params.id);
    res.json({ message: 'Group and all its expenses deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/groups/:id/members ─────────────────────────────────────────────
// Add a member by email — ADMIN ONLY
router.post('/:id/members', authenticate, isGroupAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    // Find the user to add
    const userToAdd = await User.findOne({ email: email.toLowerCase().trim() });
    if (!userToAdd) {
      return res.status(404).json({ message: 'No user found with that email. They must register first.' });
    }

    const group = req.group;

    // Can't add the admin again
    if (group.admin.toString() === userToAdd._id.toString()) {
      return res.status(400).json({ message: 'This user is already the group admin.' });
    }

    // Can't add duplicate member
    if (group.members.some((m) => m.toString() === userToAdd._id.toString())) {
      return res.status(400).json({ message: 'This user is already a group member.' });
    }

    group.members.push(userToAdd._id);
    await group.save();

    await group.populate('admin', 'name email');
    await group.populate('members', 'name email');

    res.json({ group });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/groups/:id/members/:memberId ─────────────────────────────────
// Remove a member — ADMIN ONLY
router.delete('/:id/members/:memberId', authenticate, isGroupAdmin, async (req, res) => {
  try {
    const group = req.group;

    // Can't remove someone who isn't a member
    const idx = group.members.findIndex((m) => m.toString() === req.params.memberId);
    if (idx === -1) {
      return res.status(404).json({ message: 'Member not found in this group.' });
    }

    group.members.splice(idx, 1);
    await group.save();

    await group.populate('admin', 'name email');
    await group.populate('members', 'name email');

    res.json({ group });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/groups/:id/balances ─────────────────────────────────────────────
// Calculate net balances + minimized settlement suggestions — all members can view
router.get('/:id/balances', authenticate, isGroupMember, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('admin', 'name email')
      .populate('members', 'name email');

    const expenses = await Expense.find({ group: req.params.id })
      .populate('paidBy', 'name email')
      .populate('participants', 'name email')
      .populate('enteredBy', 'name email')
      .sort({ date: -1 });

    // Everyone in the group: admin + members
    const allMembers = [group.admin, ...group.members];

    // Initialize net balances to zero
    const balanceMap = {};
    allMembers.forEach((m) => {
      balanceMap[m._id.toString()] = { user: m, amount: 0 };
    });

    // For each expense, calculate who owes what
    expenses.forEach((expense) => {
      if (!expense.participants || expense.participants.length === 0) return;

      const share   = expense.amount / expense.participants.length;
      const payerId = expense.paidBy._id.toString();

      expense.participants.forEach((participant) => {
        const pid = participant._id.toString();

        if (pid === payerId) {
          // Payer paid for themselves too — credit them for everyone else's share
          const othersCount = expense.participants.length - 1;
          if (balanceMap[pid]) balanceMap[pid].amount += share * othersCount;
        } else {
          // Non-payer owes their share to the payer
          if (balanceMap[payerId]) balanceMap[payerId].amount += share;
          if (balanceMap[pid])     balanceMap[pid].amount     -= share;
        }
      });
    });

    // ── Debt Minimization Algorithm ───────────────────────────────────────────
    // Minimizes the total number of transactions needed to settle all debts
    const settlements = [];

    const debtors   = Object.values(balanceMap)
      .filter((b) => b.amount < -0.001)
      .map((b) => ({ user: b.user, amount: Math.abs(b.amount) }));

    const creditors = Object.values(balanceMap)
      .filter((b) => b.amount > 0.001)
      .map((b) => ({ user: b.user, amount: b.amount }));

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const transferAmount = Math.min(debtors[i].amount, creditors[j].amount);

      if (transferAmount > 0.001) {
        settlements.push({
          from:   debtors[i].user,
          to:     creditors[j].user,
          amount: parseFloat(transferAmount.toFixed(2)),
        });
      }

      debtors[i].amount   -= transferAmount;
      creditors[j].amount -= transferAmount;

      if (debtors[i].amount   < 0.001) i++;
      if (creditors[j].amount < 0.001) j++;
    }

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    res.json({
      balances: Object.values(balanceMap).map((b) => ({
        user:   b.user,
        amount: parseFloat(b.amount.toFixed(2)),
      })),
      settlements,
      expenses,
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
