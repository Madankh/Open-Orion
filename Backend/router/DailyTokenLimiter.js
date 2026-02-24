// dailyTokenLimiter.js
const cron = require('node-cron');
const User = require('../models/User'); // Adjust path as needed

class DailyTokenLimiter {
    constructor() {
        this.planLimits = {
            'free': {
                monthly_credits: 600, // 600 credits per month
                daily_credits: Math.floor(600 / 30) // ~20 credits per day
            },
            'basic': {
                monthly_credits: 10000, // 10,000 credits per month
                daily_credits: Math.floor(10000 / 30) // ~333 credits per day
            },
            'mid': {
                monthly_credits: 25000, // 25,000 credits per month
                daily_credits: Math.floor(25000 / 30) // ~833 credits per day
            },
            'high': {
                monthly_credits: 50000, // 50,000 credits per month
                daily_credits: Math.floor(50000 / 30) // ~1,666 credits per day
            },
            'custom_api': {
                monthly_credits: -1, // Unlimited
                daily_credits: -1 // Unlimited
            }
        };
    }

    async initializeUserLimits(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');

            const planLimit = this.planLimits[user.plan] || this.planLimits['free'];
            
            // Set daily limit and reset date
            const updateData = {
                daily_credit_limit: planLimit.daily_credits,
                daily_credits_used: 0,
                daily_reset_at: this.getNextResetTime()
            };

            await User.findByIdAndUpdate(userId, updateData);
            console.log(`Initialized limits for user ${userId} on plan ${user.plan}`);
            
            return updateData;
        } catch (error) {
            console.error('Error initializing user limits:', error);
            throw error;
        }
    }

    /**
     * Check if user can use credits (before making API call)
     */
    async checkCreditAvailability(userId, estimatedCredits) {
        try {
            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');

            // Check if daily reset is needed
            await this.checkAndResetDailyLimit(userId);

            // Custom API users have unlimited access
            if (user.plan === 'custom_api') {
                return {
                    canProceed: true,
                    unlimited: true,
                    remainingCredits: -1
                };
            }

            const remainingDaily = user.daily_credit_limit - user.daily_credits_used;
            const canProceed = remainingDaily >= estimatedCredits;

            return {
                canProceed,
                unlimited: false,
                remainingCredits: remainingDaily,
                dailyLimit: user.daily_credit_limit,
                creditsUsed: user.daily_credits_used,
                resetAt: user.daily_reset_at,
                estimatedCredits
            };
        } catch (error) {
            console.error('Error checking credit availability:', error);
            throw error;
        }
    }

    async deductCreditsWithDailyLimit(userId, creditsUsed, modelName) {
        try {
            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');

            // Check daily reset first
            await this.checkAndResetDailyLimit(userId);

            // Custom API users bypass daily limits but still track usage
            if (user.plan === 'custom_api') {
                // Still deduct from main balance using your existing system
                // But don't check daily limits
                return {
                    success: true,
                    creditsDeducted: creditsUsed,
                    dailyLimitBypassed: true,
                    remainingDaily: -1,
                    modelUsed: modelName
                };
            }

            // Check if user has enough daily credits
            const remainingDaily = user.daily_credit_limit - user.daily_credits_used;
            if (remainingDaily < creditsUsed) {
                return {
                    success: false,
                    error: 'Daily credit limit exceeded',
                    creditsNeeded: creditsUsed,
                    remainingDaily: remainingDaily
                };
            }

            // Update daily usage
            const newDailyUsed = user.daily_credits_used + creditsUsed;
            await User.findByIdAndUpdate(userId, {
                daily_credits_used: newDailyUsed
            });

            return {
                success: true,
                creditsDeducted: creditsUsed,
                dailyUsed: newDailyUsed,
                remainingDaily: user.daily_credit_limit - newDailyUsed,
                dailyLimit: user.daily_credit_limit,
                modelUsed: modelName
            };

        } catch (error) {
            console.error('Error deducting credits with daily limit:', error);
            throw error;
        }
    }

    /**
     * Check if daily limit needs reset
     */
    async checkAndResetDailyLimit(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) return;

            const now = new Date();
            const resetTime = new Date(user.daily_reset_at);

            if (now >= resetTime) {
                // Reset daily usage
                const planLimit = this.planLimits[user.plan] || this.planLimits['free'];
                
                await User.findByIdAndUpdate(userId, {
                    daily_credits_used: 0,
                    daily_credit_limit: planLimit.daily_credits, // FIXED: was daily_tokens
                    daily_reset_at: this.getNextResetTime()
                });

                console.log(`Daily limit reset for user ${userId}`);
            }
        } catch (error) {
            console.error('Error checking daily reset:', error);
        }
    }

    /**
     * Get next reset time (24 hours from now)
     */
    getNextResetTime() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0); // Reset at midnight
        return tomorrow;
    }

    /**
     * Get user's daily usage statistics
     */
    async getDailyUsageStats(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');

            await this.checkAndResetDailyLimit(userId);

            const planLimit = this.planLimits[user.plan] || this.planLimits['free'];
            
            return {
                plan: user.plan,
                dailyLimit: user.daily_credit_limit,
                dailyUsed: user.daily_credits_used,
                dailyRemaining: user.plan === 'custom_api' ? -1 : user.daily_credit_limit - user.daily_credits_used,
                resetAt: user.daily_reset_at,
                monthlyLimit: planLimit.monthly_credits, // FIXED: was monthly_tokens
                unlimited: user.plan === 'custom_api'
            };
        } catch (error) {
            console.error('Error getting daily usage stats:', error);
            throw error;
        }
    }

    /**
     * Cron job to reset all users' daily limits at midnight
     */
    // setupDailyResetCron() {
    //     // Run every day at midnight (00:00)
    //     cron.schedule('0 0 * * *', async () => {
    //         console.log('Running daily credit limit reset...');
            
    //         try {
    //             const now = new Date();
                
    //             // Find users whose reset time has passed
    //             const usersToReset = await User.find({
    //                 daily_reset_at: { $lte: now },
    //                 plan: { $in: ['free', 'basic', 'mid', 'high'] } // Don't reset custom_api
    //             });

    //             for (const user of usersToReset) {
    //                 const planLimit = this.planLimits[user.plan] || this.planLimits['free'];
                    
    //                 await User.findByIdAndUpdate(user._id, {
    //                     daily_credits_used: 0,
    //                     daily_credit_limit: planLimit.daily_credits, // FIXED: was daily_tokens
    //                     daily_reset_at: this.getNextResetTime()
    //                 });
    //             }

    //             console.log(`Reset daily limits for ${usersToReset.length} users`);
    //         } catch (error) {
    //             console.error('Error in daily reset cron:', error);
    //         }
    //     });

    //     console.log('Daily reset cron job scheduled');
    // }

    setupDailyResetCron() {
    // Run every minute for testing (change back to '0 0 * * *' for production)
    cron.schedule('* * * * *', async () => {
        console.log('Running daily credit limit reset (TEST MODE - every minute)...');
                 
        try {
            const now = new Date();
                         
            // Find users whose reset time has passed
            const usersToReset = await User.find({
                daily_reset_at: { $lte: now },
                plan: { $in: ['free', 'basic', 'mid', 'high'] } // Don't reset custom_api
            });
             
            for (const user of usersToReset) {
                const planLimit = this.planLimits[user.plan] || this.planLimits['free'];
                         
                await User.findByIdAndUpdate(user._id, {
                    daily_credits_used: 0,
                    daily_credit_limit: planLimit.daily_credits,
                    // For testing: set next reset to 1 minute from now instead of 24 hours
                    daily_reset_at: new Date(Date.now() + 60 * 1000) // 1 minute from now
                });
            }
             
            console.log(`Reset daily limits for ${usersToReset.length} users`);
        } catch (error) {
            console.error('Error in daily reset cron:', error);
        }
    });
     
    console.log('Daily reset cron job scheduled (TEST MODE - every minute)');
}

    /**
     * Manual reset for testing or admin purposes
     */
    async manualResetUser(userId) {
        try {
            const user = await User.findById(userId);
            if (!user) throw new Error('User not found');

            const planLimit = this.planLimits[user.plan] || this.planLimits['free'];
            
            await User.findByIdAndUpdate(userId, {
                daily_credits_used: 0,
                daily_credit_limit: planLimit.daily_credits, // FIXED: was daily_tokens
                daily_reset_at: this.getNextResetTime()
            });

            return { success: true, message: 'User daily limit reset successfully' };
        } catch (error) {
            console.error('Error in manual reset:', error);
            throw error;
        }
    }

    /**
     * Update user's plan and adjust limits
     */
    async updateUserPlan(userId, newPlan) {
        try {
            if (!this.planLimits[newPlan]) {
                throw new Error('Invalid plan type');
            }

            const planLimit = this.planLimits[newPlan];
            
            await User.findByIdAndUpdate(userId, {
                plan: newPlan,
                daily_credit_limit: planLimit.daily_credits, // FIXED: was daily_tokens
                daily_credits_used: 0, // Reset usage when changing plan
                daily_reset_at: this.getNextResetTime()
            });

            console.log(`Updated user ${userId} to plan ${newPlan}`);
            return { success: true, newPlan, dailyLimit: planLimit.daily_credits }; // FIXED: was daily_tokens
        } catch (error) {
            console.error('Error updating user plan:', error);
            throw error;
        }
    }

    /**
     * Batch update multiple users (useful for migrations)
     */
    async batchUpdateUserLimits(userIds) {
        try {
            const results = [];
            for (const userId of userIds) {
                try {
                    const result = await this.initializeUserLimits(userId);
                    results.push({ userId, success: true, result });
                } catch (error) {
                    results.push({ userId, success: false, error: error.message });
                }
            }
            return results;
        } catch (error) {
            console.error('Error in batch update:', error);
            throw error;
        }
    }

    /**
     * Get all users approaching their daily limit (for notifications)
     */
    async getUsersApproachingLimit(threshold = 0.9) {
        try {
            const users = await User.find({
                plan: { $in: ['free', 'basic', 'mid', 'high'] },
                daily_credit_limit: { $gt: 0 }
            });

            const approachingLimit = [];
            for (const user of users) {
                const usagePercentage = user.daily_credits_used / user.daily_credit_limit;
                if (usagePercentage >= threshold) {
                    approachingLimit.push({
                        userId: user._id,
                        plan: user.plan,
                        usagePercentage: Math.round(usagePercentage * 100),
                        creditsUsed: user.daily_credits_used,
                        creditLimit: user.daily_credit_limit,
                        remainingCredits: user.daily_credit_limit - user.daily_credits_used
                    });
                }
            }

            return approachingLimit;
        } catch (error) {
            console.error('Error getting users approaching limit:', error);
            throw error;
        }
    }
}

module.exports = DailyTokenLimiter;