const cron = require('node-cron');
const mongoose = require('mongoose');
const User = require('../models/User');
const { Paddle, Environment } = require("@paddle/paddle-node-sdk")
const PaddleApiService = require("./paddle_api_service");
mongoose.set('strictQuery', false);
// Simple structured logging
const log = {
  info: (msg, data = {}) => console.log(JSON.stringify({ level: 'info', message: msg, timestamp: new Date().toISOString(), ...data })),
  warn: (msg, data = {}) => console.log(JSON.stringify({ level: 'warn', message: msg, timestamp: new Date().toISOString(), ...data })),
  error: (msg, error = null, data = {}) => console.log(JSON.stringify({ 
    level: 'error', 
    message: msg, 
    error: error?.message || error, 
    stack: error?.stack,
    timestamp: new Date().toISOString(), 
    ...data 
  }))
};

const paddle = new Paddle(process.env.PADDLE_SECRET_TOKEN, {
  environment: process.env.PADDLE_ENVIRONMENT === 'production' ? Environment.production : Environment.sandbox,
});

// Rate limiter for Paddle API
class SimpleRateLimiter {
  constructor(maxRequests = 20, windowMs = 60000) { // 100 requests per minute
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async waitForSlot() {
    const now = Date.now();
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // +100ms buffer
      log.warn('Rate limit hit, waiting', { waitMs: waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForSlot(); // Recursive check
    }
    
    this.requests.push(now);
  }

  async makeRequest(requestFn) {
    await this.waitForSlot();
    try {
      return await requestFn();
    } catch (error) {
      if (error.message?.includes('rate limit') || error.message?.includes('429')) {
        log.warn('API rate limit error, backing off');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.makeRequest(requestFn); // Retry once
      }
      throw error;
    }
  }
}

const paddleRateLimit = new SimpleRateLimiter();

class DisasterRecoveryService {
  constructor() {
    this.isRunning = false;
    this.processLock = null;
    this.batchSize = parseInt(process.env.RECOVERY_BATCH_SIZE) || 20;
    this.gracePeriodDays = parseInt(process.env.GRACE_PERIOD_DAYS) || 7;
    this.maxRetries = 3;
    this.errorCount = 0;
    this.maxErrorThreshold = 3;
    this.paddleApi = new PaddleApiService();
  }

  // Simple file-based locking
  async acquireLock() {
    const fs = require('fs').promises;
    const lockFile = '/tmp/disaster-recovery.lock';
    
    try {
      const lockData = {
        pid: process.pid,
        timestamp: Date.now(),
        expires: Date.now() + (30 * 60 * 1000) // 30 minute lock
      };
      
      await fs.writeFile(lockFile, JSON.stringify(lockData), { flag: 'wx' });
      this.processLock = lockFile;
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        // Check if lock is stale
        try {
          const existingLock = JSON.parse(await fs.readFile(lockFile, 'utf8'));
          if (Date.now() > existingLock.expires) {
            log.warn('Removing stale lock');
            await fs.unlink(lockFile);
            return this.acquireLock(); // Try again
          }
        } catch (e) {
          // Lock file corrupted, remove it
          await fs.unlink(lockFile).catch(() => {});
          return this.acquireLock();
        }
        return false;
      }
      throw error;
    }
  }

  async releaseLock() {
    if (this.processLock) {
      try {
        const fs = require('fs').promises;
        await fs.unlink(this.processLock);
        this.processLock = null;
      } catch (error) {
        log.warn('Could not release lock', { error: error.message });
      }
    }
  }

  async shouldRunRecovery() {
    const userExists = await User.exists({
      $or: [
        { webhookFailures: { $gt: 0 } },
        { requiresManualReview: true },
        { 
          lastReconciliationCheck: { 
            $lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
          } 
        },
        { 
          $and: [
            { subscriptionId: { $ne: '' } },
            { status: { $in: ['active', 'past_due'] } },
            { lastWebhookProcessed: { $lt: new Date(Date.now() - 6 * 60 * 60 * 1000) } }
          ]
        }
      ]
    });
    
    return !!userExists;
  }

  shouldStopProcessing() {
    return this.errorCount > this.maxErrorThreshold;
  }

  resetErrorCount() {
    this.errorCount = 0;
  }

  incrementErrorCount() {
    this.errorCount++;
    if (this.shouldStopProcessing()) {
      log.error('Too many errors, stopping recovery process', { errorCount: this.errorCount });
    }
  }

  async startRecoveryMode() {
    log.info('🚨 Starting DISASTER RECOVERY mode');
    
    // Intensive recovery - every 30 minutes
    cron.schedule('0 */2 * * *', async () => {
      if (!this.isRunning) {
        await this.runRecoveryWithLock('disaster-recovery');
      }
    });
  }

  async startPeriodicDisasterRecovery() {
    log.info('🔥 Starting PERIODIC disaster recovery mode');
    
    // Run full disaster recovery every 2 hours
    cron.schedule('0 */6 * * *', async () => {
      if (!this.isRunning) {
        log.info('🚨 Running periodic disaster recovery (processes all Paddle users)');
        await this.runRecoveryWithLock('periodic-disaster-recovery');
      } else {
        log.info('⏰ Periodic disaster recovery skipped - another process running');
      }
    });
  }

  // ⭐ NEW: Aggressive lost user recovery every 15 minutes
  async startLostUserRecovery() {
    log.info('🔍 Starting LOST USER recovery mode');
    
    cron.schedule('*/30 * * * *', async () => {
      if (!this.isRunning) {
        log.info('🔍 Running lost user recovery');
        await this.runRecoveryWithLock('lost-user-recovery');
      }
    });
  }

  async startRecentUserRecovery() {
    log.info('👶 Starting RECENT user recovery mode');
    
    // Check for recent users every 30 minutes
    cron.schedule('0 */2 * * *', async () => {
      if (!this.isRunning) {
        await this.recoverRecentUsers();
      }
    });
  }

  async startNormalMode() {
    log.info('✅ Starting SMART reconciliation mode');
    cron.schedule('0 */4 * * *', async () => {
      if (!this.isRunning && await this.shouldRunRecovery()) {
        await this.runRecoveryWithLock('normal-reconciliation');
      } else {
        log.info('Skipping reconciliation - no users need recovery');
      }
    });
  }

  async runRecoveryWithLock(mode) {
    const lockAcquired = await this.acquireLock();
    if (!lockAcquired) {
      log.warn('Could not acquire lock, another process is running');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      log.info('🔄 Starting recovery process', { mode });
      
      if (mode === 'disaster-recovery' || mode === 'periodic-disaster-recovery') {
        await this.fullRecoverySync();
      } else if (mode === 'lost-user-recovery') {
        await this.recoverLostUsers();
      } else {
        await this.normalReconciliation();
      }

      log.info('✅ Recovery process completed', { 
        mode, 
        durationMs: Date.now() - startTime,
        errorCount: this.errorCount
      });
      
      this.resetErrorCount();
      
    } catch (error) {
      log.error('💥 Recovery process failed', error, { 
        mode, 
        durationMs: Date.now() - startTime 
      });
      this.incrementErrorCount();
    } finally {
      this.isRunning = false;
      await this.releaseLock();
    }
  }

  async fullRecoverySync() {
    let offset = 0;
    let totalProcessed = 0;
    let totalErrors = 0;
    
    console.log("🔥 Full recovery sync starting");
    
    // FIRST: Recover completely lost users
    const lostResults = await this.recoverLostUsers();
    let totalLostRecovered = lostResults.recovered || 0;
    console.log(totalLostRecovered, "totalLostRecovered");

    while (true) {
        if (this.shouldStopProcessing()) {
            log.warn('Stopping recovery due to too many errors', { 
                errorCount: this.errorCount, 
                totalProcessed, 
                totalErrors 
            });
            break;
        }

        const users = await User.find({
            $or: [
                { customerId: { $ne: '', $ne: 'ctm_' } },
                { subscriptionId: { $ne: '' } }
            ]
        })
        .skip(offset)
        .limit(this.batchSize);

        if (users.length === 0) {
            log.info('No more users to process', { totalProcessed, totalErrors });
            break;
        }

        log.info('Processing user batch', { 
            offset, 
            batchSize: users.length, 
            totalProcessed 
        });

        const batchResults = await this.processUserBatch(users);
        totalProcessed += batchResults.processed;
        totalErrors += batchResults.errors;

        offset += this.batchSize;
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    await this.handleExpiredGracePeriods();
    await this.validateSubscriptionStates();
    await this.syncRecentTransactions();

    log.info('Full recovery sync completed', { 
        totalProcessed, 
        totalErrors,
        totalLostRecovered,
        errorRate: totalErrors > 0 ? (totalErrors / totalProcessed * 100).toFixed(2) + '%' : '0%'
    });
  }

  // ⭐ FIXED: Comprehensive lost user recovery
  async recoverLostUsers() {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    let recoveredCount = 0;

    try {
      log.info('🔍 Starting comprehensive lost user recovery');

      const subscriptions = await this.paddleApi.getSubscriptionsDirect({
        status: ['active'],
        updatedAfter: twoDaysAgo.toISOString()
      });

      log.info('Found recent subscriptions to check', { count: subscriptions.data?.length || 0 });

      for (const subscription of subscriptions.data || []) {
        try {
          const recovered = await this.recoverFirstTimeUserFromSubscription(subscription);
          if (recovered) recoveredCount++;
        } catch (error) {
          log.error('Error checking subscription for lost user', error, { 
            subscriptionId: subscription.id 
          });
        }
      }

      // // Method 3: Check customers with recent activity
      // const customers = await this.paddleApi.getCustomersDirect({
      //   updatedAfter: twoDaysAgo.toISOString()
      // });

      // log.info('Found recent customers to check', { count: customers.data?.length || 0 });

      // for (const customer of customers.data || []) {
      //   try {
      //     const recovered = await this.checkCustomerForLostUser(customer);
      //     if (recovered) recoveredCount++;
      //   } catch (error) {
      //     log.error('Error checking customer for lost user', error, { 
      //       customerId: customer.id 
      //     });
      //   }
      // }

      log.info('Lost user recovery completed', { recovered: recoveredCount });
      return { recovered: recoveredCount };

    } catch (error) {
      log.error('Failed to recover lost users', error);
      return { recovered: recoveredCount };
    }
  }

  async recoverFirstTimeUserFromSubscription(subscription) {
    const custom = subscription.custom_data || {};
    const userId = custom.user_id || custom.userid;
    const email = custom.email ? custom.email.toLowerCase() : null;
    
    let user = null;
    
    // Prefer userId if available
    if (userId) {
      user = await User.findById(userId);
    } else if (email) {
      user = await User.findOne({ email });
    }
    
  if (user) {
    // Skip if user already has active subscription with future billing
    if (user.subscriptionId && 
        user.status === 'active' && 
        user.nextBillingDate && 
        user.nextBillingDate > new Date()) {
      return false; 
    }
      log.info('🎯 Recovering first-time user from failed webhook', {
        userId: user._id,
        subscriptionId: subscription.id,
        customerId: subscription.customer_id,
        email: user.email
      });
      
      // Get plan config for token calculations
      const currentPriceId = subscription.items?.[0]?.price?.id;
      const planConfig = this.getPlanConfigByPriceId(currentPriceId);
      
      // Calculate billing dates (fixed property names)
      const subscriptionStart = subscription.current_billing_period?.starts_at ? 
        new Date(subscription.current_billing_period.starts_at) : new Date();
      const subscriptionEnd = subscription.current_billing_period?.ends_at ? 
        new Date(subscription.current_billing_period.ends_at) : null;
      const nextBillingDate = subscription.next_billed_at ? 
        new Date(subscription.next_billed_at) : null;
      
      // Prepare update object
      const updateData = {
        subscriptionId: subscription.id,
        customerId: subscription.customer_id,
        lastWebhookProcessed: new Date(),
        lastReconciliationCheck: new Date(),
        subscriptionStart: subscriptionStart,
        billingCycle: "monthly",
        status: subscription.status === 'active' ? 'active' : subscription.status
      };
      
      // Add subscription end if available
      if (subscriptionEnd) {
        updateData.subscriptionEnd = subscriptionEnd;
      }
      
      // Add next billing date if available
      if (nextBillingDate) {
        updateData.nextBillingDate = nextBillingDate;
      }
      
      // Handle plan and token updates
      if (planConfig) {
        updateData.plan = planConfig.plan;
        updateData.priceId = currentPriceId;
        
        // Only update tokens for non-custom API plans
        if (planConfig.plan !== 'custom_api' && planConfig.token_limit !== null) {
          updateData.token_limit = planConfig.token_limit;
          updateData.lastTokenRenewal = new Date();
        }
      }
      
      // Prepare arrays to push
      const arrayUpdates = {};
      
      // Add note
      arrayUpdates.$push = {
        notes: `Lost user recovered from subscription: ${subscription.id} - ${new Date().toISOString()}`
      };
      
      // Add token renewal history if tokens were updated
      if (planConfig && planConfig.plan !== 'custom_api' && planConfig.token_limit !== null) {
        arrayUpdates.$push.tokenRenewalHistory = {
          date: new Date(),
          amount: planConfig.token_limit,
          reason: 'lost_user_recovery'
        };
      }
      
      // Add payment history entry if this looks like a recent subscription
      const isRecentSubscription = new Date(subscription.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (isRecentSubscription) {
        const amount = subscription.items?.[0]?.price?.unit_price?.amount || 0;
        arrayUpdates.$push.paymentHistory = {
          amount: parseFloat(amount) / 100, // Convert cents to dollars
          date: new Date(subscription.created_at),
          token_limit: updateData.token_limit || user.token_limit,
          transactionId: `recovered_${subscription.id}`,
          status: 'success',
          webhookReceived: false,
          reconciled: true,
          recoveredFromPaddle: true
        };
      }
      
      // Execute the update
      await User.updateOne(
        { _id: user._id },
        {
          $set: updateData,
          ...arrayUpdates
        }
      );
      return true;
    }
    
    return false;
  }

  async checkCustomerForLostUser(customer) {
    // Check if we have a user for this customer
    const existingUser = await User.findOne({ 
      $or: [
        { customerId: customer.id },
        { email: customer.email }
      ]
    });
    
    if (!existingUser && customer.email) {
      // Try to find user by email
      const user = await User.findOne({ email: customer.email });
      if (user && !user.customerId) {
        log.info('🎯 Found lost user from customer', { 
          userId: user._id, 
          customerId: customer.id,
          email: user.email
        });
        
        await this.recoverLostUserFromCustomer(user, customer);
        return true;
      }
    }
    
    return false;
  }

  async recoverLostUserFromSubscription(user, subscription) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      await this.applySubscriptionData(user, subscription);
      
      user.notes = user.notes || [];
      user.notes.push(`Lost user recovered from subscription: ${subscription.id} - ${new Date().toISOString()}`);
      user.lastReconciliationCheck = new Date();
      
      await user.save({ session });
      await session.commitTransaction();
      
      log.info('✅ Lost user recovered from subscription', { 
        userId: user._id, 
        subscriptionId: subscription.id,
        email: user.email
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async recoverLostUserFromCustomer(user, customer) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      user.customerId = customer.id;
      
      // Try to find active subscriptions for this customer
      const subscriptions = await paddleRateLimit.makeRequest(() =>
        paddle.subscriptions.list({
          customerId: [customer.id],
          status: ['active', 'past_due']
        })
      );

      if (subscriptions.data && subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0]; // Take the first active subscription
        await this.applySubscriptionData(user, subscription);
      }
      
      user.notes = user.notes || [];
      user.notes.push(`Lost user recovered from customer: ${customer.id} - ${new Date().toISOString()}`);
      user.lastReconciliationCheck = new Date();
      
      await user.save({ session });
      await session.commitTransaction();
      
      log.info('✅ Lost user recovered from customer', { 
        userId: user._id, 
        customerId: customer.id,
        email: user.email
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async applySubscriptionData(user, subscription) {
    user.customerId = subscription.customerId;
    user.subscriptionId = subscription.id;
    user.status = subscription.status === 'active' ? 'active' : subscription.status;
    
    const planConfig = this.getPlanConfigByPriceId(subscription.items[0].price.id);
    if (planConfig) {
      user.plan = planConfig.plan;
      user.priceId = subscription.items[0].price.id;
      
      if (planConfig.plan !== 'custom_api' && planConfig.token_limit !== null) {
        user.token_limit = planConfig.token_limit;
        user.lastTokenRenewal = new Date();
        
        if (!user.tokenRenewalHistory) user.tokenRenewalHistory = [];
        user.tokenRenewalHistory.push({
          date: new Date(),
          amount: planConfig.token_limit,
          reason: 'lost_user_recovery'
        });
      }
    }
    
    if (subscription.currentBillingPeriod) {
      user.subscriptionStart = new Date(subscription.currentBillingPeriod.startsAt);
      user.subscriptionEnd = new Date(subscription.currentBillingPeriod.endsAt);
    }
    
    if (subscription.nextBilledAt) {
      user.nextBillingDate = new Date(subscription.nextBilledAt);
    }
  }

  // Rest of your existing methods remain the same...
  async processUserBatch(users) {
    const results = await Promise.allSettled(
      users.map(user => this.recoverUserWithTransaction(user))
    );

    let processed = 0;
    let errors = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        processed++;
      } else {
        errors++;
        this.incrementErrorCount();
        log.error('User recovery failed', result.reason, { 
          userId: users[index]._id,
          userEmail: users[index].email 
        });
      }
    });

    return { processed, errors };
  }

  async recoverUserWithTransaction(user) {
    const session = await mongoose.startSession();
    
    let retries = 0;
    while (retries < this.maxRetries) {
      session.startTransaction();
      
      try {
        log.info('🔧 Recovering user', { 
          userId: user._id, 
          email: user.email,
          currentStatus: user.status,
          retry: retries
        });

        const changes = await this.calculateUserChanges(user);
        
        if (changes.hasChanges) {
          await this.applyUserChanges(user, changes, session);
          
          log.info('✅ User recovered successfully', {
            userId: user._id,
            email: user.email,
            changes: changes.summary
          });
        } else {
          user.lastReconciliationCheck = new Date();
          await user.save({ session });
          
          log.info('✅ User verified (no changes)', { 
            userId: user._id, 
            email: user.email 
          });
        }

        await session.commitTransaction();
        return true;
        
      } catch (error) {
        await session.abortTransaction();
        retries++;
        
        if (retries >= this.maxRetries) {
          try {
            await this.markForManualReview(user, error);
          } catch (markError) {
            log.error('Failed to mark user for manual review', markError);
          }
          throw error;
        }
        
        log.warn('Retrying user recovery', { 
          userId: user._id, 
          retry: retries, 
          error: error.message 
        });
        
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
      } finally {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
      }
    }
    
    session.endSession();
  }

  async calculateUserChanges(user) {
    const changes = {
      hasChanges: false,
      updates: {},
      summary: [],
      paddleData: {}
    };

    try {
      // 1. Get subscription data if available
      if (user.subscriptionId) {
        try {
          changes.paddleData.subscription = await paddleRateLimit.makeRequest(
            () => paddle.subscriptions.get(user.subscriptionId)
          );
        } catch (error) {
          if (error.message?.includes('404')) {
            changes.updates.status = 'inactive';
            changes.updates.plan = 'free';
            changes.updates.token_limit = 60;
            changes.updates.subscriptionId = '';
            changes.hasChanges = true;
            changes.summary.push('subscription_not_found');
          } else {
            throw error; 
          }
        }
      }

      // 2. Get customer data if available
      if (user.customerId && user.customerId !== 'ctm_') {
        try {
          changes.paddleData.customer = await paddleRateLimit.makeRequest(
            () => paddle.customers.get(user.customerId)
          );
        } catch (error) {
          if (!error.message?.includes('404')) {
            throw error;
          }
        }
      }

      // 3. Get recent transactions
      if (user.customerId && user.customerId !== 'ctm_') {
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const transactions = await paddleRateLimit.makeRequest(() =>
            paddle.transactions.list({
              customerId: [user.customerId],
              createdAfter: sevenDaysAgo.toISOString(),
              status: ['completed', 'paid', 'refunded', 'partially_refunded']
            })
          );
          changes.paddleData.recentTransactions = transactions.data || [];
        } catch (error) {
          log.warn('Could not fetch recent transactions', { 
            userId: user._id, 
            error: error.message 
          });
        }
      }

      // 4. Analyze subscription status
      if (changes.paddleData.subscription) {
        const sub = changes.paddleData.subscription;
        // Status reconciliation
        if (sub.status === 'active' && user.status !== 'active') {
          changes.updates.status = 'active';
          changes.updates.gracePeriodEnd = undefined;
          const currentId = sub.items?.[0]?.price?.id;
          const planConfig = this.getPlanConfigByPriceId(currentId);
          if (planConfig && planConfig.token_limit !== null) {
            this.addTokenRenewal(changes, user, planConfig.token_limit, 'activation_recovery');
            changes.summary.push('tokens_refreshed_activation');
          }
          changes.hasChanges = true;
          changes.summary.push('activated');
        } else if (sub.status === 'canceled' && user.status !== 'inactive') {
          changes.updates.status = 'inactive';
          changes.updates.plan = 'free';
          changes.updates.token_limit = 0;
          changes.updates.gracePeriodEnd = undefined;
          changes.updates.priceId='pri_';
          changes.updates.customerId='ctm_';
          changes.updates.subscriptionId='';
          changes.updates.subscriptionEnd = null;
          changes.updates.subscriptionStart = null;
          changes.updates.nextBillingDate = null; 
          changes.hasChanges = true;
          changes.summary.push('canceled');
        } else if (sub.status === 'past_due' && user.status !== 'past_due') {
          changes.updates.status = 'past_due';
          if (!user.gracePeriodEnd) {
            changes.updates.gracePeriodEnd = new Date(Date.now() + this.gracePeriodDays * 24 * 60 * 60 * 1000);
          }
          changes.hasChanges = true;
          changes.summary.push('past_due');
        }

        // Plan changes
        const currentPriceId = sub.items?.[0]?.price?.id;
        if (currentPriceId && currentPriceId !== user.priceId) {
          const planConfig = this.getPlanConfigByPriceId(currentPriceId);
          if (planConfig) {
            changes.updates.priceId = currentPriceId;
            changes.updates.plan = planConfig.plan;
            
            if (planConfig.plan !== 'custom_api' && planConfig.token_limit !== user.token_limit && !this.hasRecentTokenRenewal(user, 'plan_change_recovery', 24)) {
              this.addTokenRenewal(changes, user, planConfig.token_limit, 'plan_change_recovery');
            }
            
            changes.hasChanges = true;
            changes.summary.push(`plan_changed_${planConfig.plan}`);
          }
        }

        // Billing period updates
        if (sub.currentBillingPeriod) {
          const newStart = new Date(sub.currentBillingPeriod.startsAt);
          const newEnd = new Date(sub.currentBillingPeriod.endsAt);
          
          // Check for missed renewal
          const EPS = 1000;
          if (sub.status === 'active' && 
              user.subscriptionEnd &&
              newEnd.getTime() > user.subscriptionEnd.getTime() + EPS) {
            
            const planConfig = this.getPlanConfigByPriceId(currentPriceId);
            
            if (planConfig && planConfig.plan !== 'custom_api') {
               this.addTokenRenewal(changes, user, planConfig.token_limit, 'missed_renewal_recovery');
              
              changes.hasChanges = true;
              changes.summary.push('tokens_renewed_missed');
              // Update subscription dates
              if (!user.subscriptionStart || user.subscriptionStart.getTime() !== newStart.getTime()) {
                changes.updates.subscriptionStart = newStart;
                changes.hasChanges = true;
              }
              
              if (!user.subscriptionEnd || user.subscriptionEnd.getTime() !== newEnd.getTime()) {
                changes.updates.subscriptionEnd = newEnd;
                changes.hasChanges = true;
              }
            }
          }
          
        }

        // Next billing date
        if (sub.nextBilledAt) {
          const newNextBilling = new Date(sub.nextBilledAt);
          if (!user.nextBillingDate || user.nextBillingDate.getTime() !== newNextBilling.getTime()) {
            changes.updates.nextBillingDate = newNextBilling;
            changes.hasChanges = true;
          }
        }
      }

      // 5. Sync missing transactions
      if (changes.paddleData.recentTransactions) {
        const newTransactions = [];
        
        for (const transaction of changes.paddleData.recentTransactions) {
          const existing = user.paymentHistory.find(p => p.transactionId === transaction.id);
          
          if (!existing) {
            let paymentStatus = 'success';
            if (transaction.status === 'refunded') paymentStatus = 'refunded';
            else if (transaction.status === 'partially_refunded') paymentStatus = 'partially_refunded';
            
            newTransactions.push({
              amount: transaction.details?.totals?.grandTotal || 0,
              date: new Date(transaction.createdAt),
              token_limit: user.token_limit,
              invoiceUrl: transaction.invoiceNumber || transaction.id,
              transactionId: transaction.id,
              status: paymentStatus,
              webhookReceived: false,
              reconciled: true,
              recoveredFromPaddle: true
            });

            // Handle refunds
            if (transaction.status === 'refunded' && user.status === 'active') {
              changes.updates.status = 'inactive';
              changes.updates.plan = 'free';
              changes.updates.token_limit = 60;
              changes.hasChanges = true;
              changes.summary.push('refunded');
            }
          }
        }

        if (newTransactions.length > 0) {
          changes.updates.newPaymentHistory = newTransactions;
          changes.hasChanges = true;
          changes.summary.push(`${newTransactions.length}_transactions_synced`);
        }
      }

      // Always update reconciliation timestamp
      changes.updates.lastReconciliationCheck = new Date();
      changes.updates.webhookFailures = 0;
      changes.updates.requiresManualReview = false;

      return changes;

    } catch (error) {
      log.error('Error calculating user changes', error, { userId: user._id });
      throw error;
    }
  }

  async applyUserChanges(user, changes, session) {
    // Apply all updates to the user object
    Object.keys(changes.updates).forEach(key => {
      if (key === 'newPaymentHistory') {
        user.paymentHistory.push(...changes.updates.newPaymentHistory);
      } else if (key === 'tokenRenewalHistory') {
        if (!user.tokenRenewalHistory) user.tokenRenewalHistory = [];
        user.tokenRenewalHistory.push(...changes.updates.tokenRenewalHistory);
      } else {
        user[key] = changes.updates[key];
      }
    });

    // Add audit note
    if (changes.summary.length > 0) {
      user.notes = user.notes || [];
      user.notes.push(`Recovery: ${changes.summary.join(', ')} - ${new Date().toISOString()}`);
    }

    await user.save({ session });
  }

  async markForManualReview(user, error) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      user.requiresManualReview = true;
      user.notes = user.notes || [];
      user.notes.push(`Recovery failed: ${error.message} - ${new Date().toISOString()}`);
      user.lastReconciliationCheck = new Date();
      
      await user.save({ session });
      await session.commitTransaction();
      
      log.error('User marked for manual review', error, { 
        userId: user._id, 
        email: user.email 
      });
    } catch (markError) {
      await session.abortTransaction();
      throw markError;
    } finally {
      session.endSession();
    }
  }

  async handleExpiredGracePeriods() {
    const expiredUsers = await User.find({
      gracePeriodEnd: { $lt: new Date() },
      status: { $ne: 'inactive' }
    }).limit(this.batchSize);

    log.info('Processing expired grace periods', { count: expiredUsers.length });

    for (const user of expiredUsers) {
      try {
        await this.recoverUserWithTransaction(user);
      } catch (error) {
        log.error('Failed to process expired grace period', error, { 
          userId: user._id 
        });
      }
    }
  }

  async validateSubscriptionStates() {
    const activeUsers = await User.find({
      status: 'active',
      subscriptionId: { $ne: '' }
    }).limit(this.batchSize * 2);

    log.info('Validating subscription states', { count: activeUsers.length });
    await this.processUserBatch(activeUsers);
  }

  async syncRecentTransactions() {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const transactions = await paddleRateLimit.makeRequest(() =>
        paddle.transactions.list({
          status: ['completed', 'paid', 'refunded', 'partially_refunded'],
          createdAfter: oneDayAgo.toISOString()
        })
      );

      log.info('Found recent transactions to verify', { count: transactions.data?.length || 0 });

      const userIds = [...new Set((transactions.data || []).map(t => t.customerId))];
      const users = await User.find({ customerId: { $in: userIds } });

      await this.processUserBatch(users);
      
    } catch (error) {
      log.error('Failed to sync recent transactions', error);
    }
  }

  async normalReconciliation() {
    const usersNeedingCheck = await User.find({
      $or: [
        { lastReconciliationCheck: { $lt: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
        { webhookFailures: { $gt: 0 } },
        { requiresManualReview: true },
        { gracePeriodEnd: { $exists: true } }
      ]
    }).limit(this.batchSize * 2);

    log.info('Normal reconciliation started', { usersToCheck: usersNeedingCheck.length });
    await this.processUserBatch(usersNeedingCheck);
  }

  hasRecentTokenRenewal(user, reason, hoursThreshold = 24) {
    if (!user.tokenRenewalHistory || user.tokenRenewalHistory.length === 0) {
      return false;
    }
    
    const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
    return user.tokenRenewalHistory.some(renewal => 
      renewal.date > threshold && 
      renewal.reason === reason
    );
  }

  addTokenRenewal(changes, user, amount, reason) {
    changes.updates.token_limit = amount;
    changes.updates.lastTokenRenewal = new Date();
    
    if (!changes.updates.tokenRenewalHistory) {
      changes.updates.tokenRenewalHistory = [];
    }
    
    changes.updates.tokenRenewalHistory.push({
      date: new Date(),
      amount: amount,
      reason: reason
    });
    
    changes.hasChanges = true;
  }

  getPlanConfigByPriceId(priceId) {
    const PRICE_PLAN_CONFIG = {
      'pri_01k1tzpsngg82h1j0fc9rj92rb': { plan: 'basic', token_limit: 8000 },
      'pri_01k4cqb86ptfc3fm83e46at076': { plan: 'starter', token_limit: 3400 },
      'pri_01k1tzxa0d6ep79f80x6rab127': { plan: 'custom_api', token_limit: 0 }
    };

    return PRICE_PLAN_CONFIG[priceId] || null;
  }
}

// Graceful shutdown handling
const recoveryService = new DisasterRecoveryService();

process.on('SIGTERM', async () => {
  log.info('Received SIGTERM, gracefully shutting down');
  await recoveryService.releaseLock();
  process.exit(0);
});

process.on('SIGINT', async () => {
  log.info('Received SIGINT, gracefully shutting down');
  await recoveryService.releaseLock();
  process.exit(0);
});


// Export for manual runs
module.exports = recoveryService;