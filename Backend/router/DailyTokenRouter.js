const express = require("express");
const router = require("express").Router();
const mongoose = require('mongoose'); // Added missing import
router.use(express.static('public'));
router.use(express.urlencoded({ extended: true }));
router.use(express.json());
const User = require("../models/User"); // Fixed path
require("dotenv").config();
const dotenv = require("dotenv");
dotenv.config();

const DailyTokenLimiter = require("./DailyTokenLimiter");
const { verifyToken } = require("./verifyToken");
const tokenLimiter = new DailyTokenLimiter();

// 3. Deduct credits after AI call 
router.post('/deduct-credits',verifyToken, async (req, res) => {
    try {
        const { userId, creditsUsed = 0 } = req.body;

        if (!userId || creditsUsed <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid input' });
        }

        // SIMPLE: Just check subscription credits (no daily limits!)
        const updatedUser = await User.findOneAndUpdate(
            {
                _id: userId,
                token_limit: { $gte: creditsUsed } 
            },
            {
                $inc: { token_limit: -creditsUsed } 
            },
            { new: true }
        );

        if (!updatedUser) {
            const user = await User.findById(userId);
            return res.status(429).json({
                success: false,
                error: 'Insufficient credits',
                currentBalance: user?.token_limit || 0,
                needed: creditsUsed
            });
        }

        res.json({
            success: true,
            remainingCredits: updatedUser.token_limit,
            message: updatedUser.token_limit < 100 ? "Low credits - consider upgrading!" : null
        });

    } catch (error) {
        res.status(500).json({ success: false, error: 'Server error' });
    }
});


module.exports = router;