// routes/tokenLimiter.js
const express = require('express');
const DailyTokenLimiter = require('../router/DailyTokenLimiter');
const { MultiModelTokenCalculator } = require('../services/tokenCalculator'); // Your existing class
const { verifyToken } = require('./verifyToken');
const router = express.Router();

const tokenLimiter = new DailyTokenLimiter();
const tokenCalculator = new MultiModelTokenCalculator();

// Middleware to check token availability before API calls
const checkTokenLimit = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.body?.userId;
        const modelName = req.body?.model || 'gpt-5-mini';
        
        if (!userId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        // Estimate tokens needed (you can make this more sophisticated)
        const estimatedTokens = req.body?.estimatedTokens || 1000;
        
        const availability = await tokenLimiter.checkTokenAvailability(userId, estimatedTokens);
        
        if (!availability.canProceed && !availability.unlimited) {
            return res.status(429).json({
                error: 'Daily token limit exceeded',
                details: {
                    remainingTokens: availability.remainingTokens,
                    dailyLimit: availability.dailyLimit,
                    tokensUsed: availability.tokensUsed,
                    resetAt: availability.resetAt
                }
            });
        }

        // Attach availability info to request for later use
        req.tokenAvailability = availability;
        next();
    } catch (error) {
        console.error('Token limit check error:', error);
        res.status(500).json({ error: 'Token limit check failed' });
    }
};

// Modified deduction function that works with your existing system
const deductTokensWithLimit = async (userId, tokenInfo, modelName) => {
    try {
        // First, check daily limits
        const dailyResult = await tokenLimiter.deductTokensWithDailyLimit(userId, tokenInfo, modelName);
        
        if (!dailyResult.success && !dailyResult.dailyLimitBypassed) {
            return dailyResult;
        }

        // If daily limit check passed, proceed with your existing credit deduction
        const user = await User.findById(userId);
        const creditResult = await tokenCalculator.deduct_credits(
            user.token_limit, 
            tokenInfo, 
            userId, 
            modelName
        );

        return {
            ...creditResult,
            dailyLimitInfo: {
                dailyUsed: dailyResult.dailyUsed,
                remainingDaily: dailyResult.remainingDaily,
                dailyLimit: dailyResult.dailyLimit
            }
        };
    } catch (error) {
        console.error('Error in combined token deduction:', error);
        throw error;
    }
};

// Get user's daily usage statistics
router.get('/daily-usage/:userId',verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const stats = await tokenLimiter.getDailyUsageStats(userId);
        res.json(stats);
    } catch (error) {
        console.error('Error getting daily usage:', error);
        res.status(500).json({ error: 'Failed to get daily usage statistics' });
    }
});

// Check token availability before making a request
router.post('/check-availability',verifyToken, async (req, res) => {
    try {
        const { userId, estimatedTokens = 1000 } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID required' });
        }

        const availability = await tokenLimiter.checkTokenAvailability(userId, estimatedTokens);
        res.json(availability);
    } catch (error) {
        console.error('Error checking availability:', error);
        res.status(500).json({ error: 'Failed to check token availability' });
    }
});

// Process token deduction (call this after your AI API call)
router.post('/deduct-tokens',verifyToken, async (req, res) => {
    try {
        const { userId, tokenInfo, modelName } = req.body;
        
        if (!userId || !tokenInfo || !modelName) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const result = await deductTokensWithLimit(userId, tokenInfo, modelName);
        res.json(result);
    } catch (error) {
        console.error('Error deducting tokens:', error);
        res.status(500).json({ error: 'Failed to deduct tokens' });
    }
});

// Admin: Reset user's daily limit
router.post('/admin/reset-daily/:userId',verifyToken,async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await tokenLimiter.manualResetUser(userId);
        res.json(result);
    } catch (error) {
        console.error('Error resetting daily limit:', error);
        res.status(500).json({ error: 'Failed to reset daily limit' });
    }
});

// Admin: Update user plan
router.post('/admin/update-plan',verifyToken, async (req, res) => {
    try {
        const { userId, newPlan } = req.body;
        
        if (!userId || !newPlan) {
            return res.status(400).json({ error: 'User ID and new plan required' });
        }

        const result = await tokenLimiter.updateUserPlan(userId, newPlan);
        res.json(result);
    } catch (error) {
        console.error('Error updating user plan:', error);
        res.status(500).json({ error: 'Failed to update user plan' });
    }
});

// Initialize user limits (call when user signs up or changes plan)
router.post('/initialize/:userId',verifyToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await tokenLimiter.initializeUserLimits(userId);
        res.json({ success: true, limits: result });
    } catch (error) {
        console.error('Error initializing user limits:', error);
        res.status(500).json({ error: 'Failed to initialize user limits' });
    }
});

// Export middleware and routes
module.exports = {
    router,
    checkTokenLimit,
    deductTokensWithLimit,
    tokenLimiter
};