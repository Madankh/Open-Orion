const express = require("express");
const User = require("../models/User");
const { Paddle, Environment, EventName } = require("@paddle/paddle-node-sdk")
const router = express();
const {generatePaymentEmailHTML, generatePaymentFailedEmailHTML,generateSubscriptionCancelEmailHTML} = require("../view/mail")
require("dotenv").config();

const paddle = new Paddle(process.env.PADDLE_SECRET_TOKEN, {
  environment: Environment.production,
});

const { Resend } = require('resend');
const resend = new Resend(process.env.RESENDAPI);

// Price ID to Plan mapping configuration
const PRICE_PLAN_CONFIG = {
    'pri_01k4cqb86ptfc3fm83e46at076': {  
        plan: 'starter',
        token_limit: 3400
    },
    'pri_01k1tzpsngg82h1j0fc9rj92rb': {  
        plan: 'basic',
        token_limit: 8000
    },
    'pri_01k1tzxa0d6ep79f80x6rab127': {  
        plan: 'custom_api',
        token_limit: null // No token limit for custom_api users
    }
};

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = (req.headers['paddle-signature']) || '';
    const rawRequestBody = req.body.toString();
    const secretKey = process.env.PADDLE_WEBHOOK_SECRET;
    
    try {
        if (!signature) {
            return res.status(400).json({ error: 'No signature provided' });
        }

        if (!rawRequestBody) {
            return res.status(400).json({ error: 'No request body provided' });
        }

        const eventData = await paddle.webhooks.unmarshal(rawRequestBody, secretKey, signature);
        console.log(eventData, "eventData")
        
        // Handle different event types with clear separation
        switch (eventData.eventType) {
            case EventName.TransactionCompleted:
                await handleTransactionCompleted(eventData.data);
                break;

            case EventName.SubscriptionCreated:
                await handleSubscriptionCreated(eventData.data);
                break;
                
            case EventName.TransactionPaid:
                await handleTransactionPaid(eventData.data);
                break;

            case EventName.SubscriptionUpdated:
                await handleSubscriptionUpdated(eventData.data);
                break;

            case EventName.SubscriptionCanceled:
                await handleSubscriptionCanceled(eventData.data);
                break;

            case EventName.TransactionPaymentFailed:
                await handlePaymentFailed(eventData.data);
                break;

            default:
                console.log(`Unhandled Paddle event type: ${eventData.eventType}`);
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Error processing Paddle webhook:', error);
        
        if (error.message && error.message.includes('signature')) {
            console.log('⚠️ Webhook signature verification failed');
            return res.status(400).json({ error: 'Invalid signature' });
        }
        
        res.status(400).json({ error: 'Webhook processing failed' });
    }
});

async function logWebhookFailure(req, error) {
    try {
        const signature = req.headers['paddle-signature'] || '';
        const body = req.body.toString();
        
        console.error('🚨 Webhook Failure Log:', {
            timestamp: new Date().toISOString(),
            signature: signature.substring(0, 20) + '...',
            bodyLength: body.length,
            error: error.message,
            stack: error.stack?.substring(0, 500)
        });
        
        // Optionally save to database for reconciliation
        // await WebhookFailureLog.create({ signature, body, error: error.message });
        
    } catch (logError) {
        console.error('Failed to log webhook failure:', logError);
    }
}

// Helper function to find user by customer ID or email
async function findUserByCustomerOrEmail(customerId, email = null) {
    let user = await User.findOne({ customerId: customerId });
    
    if (!user && email) {
        user = await User.findOne({ email: email });
        
        if (user && !user.customerId) {
            user.customerId = customerId;
            await user.save();
        }
    }
    
    if (!user && !email) {
        try {
            const customer = await paddle.customers.get(customerId);
            user = await User.findOne({ email: customer.email });
            
            if (user && !user.customerId) {
                user.customerId = customerId;
                await user.save();
            }
        } catch (error) {
            console.error('Error fetching customer from Paddle:', error);
        }
    }
    
    return user;
}

// 1. Subscription Created - Just record the subscription, don't activate user yet
async function handleSubscriptionCreated(subscription) {
    try {
        console.log('📝 Subscription created:', subscription.id);
        
        const customerId = subscription.customerId;
        const user = await findUserByCustomerOrEmail(customerId);
        
        if (user) {
            user.subscriptionId = subscription.id;
            user.customerId = customerId;
            user.lastWebhookProcessed = new Date();

            const priceId = subscription.items?.[0]?.price?.id;
            if (priceId) {
                user.priceId = priceId;
                // Set plan based on price ID but don't activate yet
                const planConfig = PRICE_PLAN_CONFIG[priceId];
                if (planConfig) {
                    user.plan = planConfig.plan;
                    console.log(`📋 Plan set to: ${planConfig.plan}`);
                }
            }
            
            await user.save();
            console.log('✅ Subscription recorded for user:', user.email);
        } else {
            console.log('❌ User not found for subscription creation');
            await flagForManualReview(customerId, 'subscription_created_no_user');
        }
        
    } catch (error) {
        console.error('Error handling subscription created:', error);
    }
}

// 1. Transaction PAID - IMMEDIATE activation (payment captured, give access now!)
async function handleTransactionPaid(transaction) {
    try {
        console.log('⚡ Payment CAPTURED (immediate activation):', transaction.id);
        
        const customerEmail = transaction.customData?.email || transaction.customer?.email;
        const customerId = transaction.customerId;
        
        if (!customerEmail && !customerId) {
            console.log('❌ No customer info found in transaction');
            await flagForManualReview(transaction.id, 'transaction_paid_no_customer');
            return;
        }
        
        const user = await findUserByCustomerOrEmail(customerId, customerEmail);
        
        if (!user) {
            console.log('❌ User not found for transaction:', transaction.id);
            await flagForManualReview(customerId || customerEmail, 'transaction_paid_no_user');
            return;
        }
        
        // IMMEDIATELY activate user - payment is captured!
        user.status = "active";
        user.lastWebhookProcessed = new Date(); // NEW: Track webhook processing
        user.webhookFailures = 0; // NEW: Reset failure count
        user.gracePeriodEnd = undefined;

        if (customerId && !user.customerId) {
            user.customerId = customerId;
        }
        
        // Grant tokens and set plan immediately based on what they're paying for
        const priceId = transaction.items?.[0]?.price?.id;
        if (priceId) {
            user.priceId = priceId;
            await setPlanAndTokenLimitsByPriceId(user, priceId);
            
            // Track token renewal for payment
            const planConfig = PRICE_PLAN_CONFIG[priceId];
            if (planConfig && planConfig.token_limit !== null) {
                user.lastTokenRenewal = new Date();
                
                // Add to renewal history
                if (!user.tokenRenewalHistory) user.tokenRenewalHistory = [];
                user.tokenRenewalHistory.push({
                    date: new Date(),
                    amount: planConfig.token_limit,
                    reason: 'payment_captured'
                });
            }
            
            console.log('⚡ IMMEDIATE plan and tokens granted:', {
                plan: user.plan,
                tokens: user.token_limit
            });
        }
        
       if (!user.paymentHistory) user.paymentHistory = [];
        
        // Check for duplicate payment records
        const existingPayment = user.paymentHistory.find(p => p.transactionId === transaction.id);
        if (!existingPayment) {
            user.paymentHistory.push({
                amount: transaction.details?.totals?.grand_total || transaction.totals?.grand_total || 0,
                date: new Date(transaction.created_at || transaction.createdAt),
                token_limit: user.token_limit,
                invoiceUrl: transaction.invoice_number || transaction.id,
                transactionId: transaction.id,
                status: "success",
                webhookReceived: true,
                reconciled: true
            });
        }

        await user.save();        
    } catch (error) {
        console.error('Error handling transaction paid:', error);
        throw error;
    }
}

async function handleTransactionCompleted(transaction) {
    try {
        console.log('🏁 Payment FULLY PROCESSED (final data):', transaction.id);
        
        const customerEmail = transaction.customData?.email || transaction.customer?.email;
        const customerId = transaction.customerId;
        
        if (!customerEmail && !customerId) {
            console.log('❌ No customer info found in transaction');
            return;
        }
        
        const user = await findUserByCustomerOrEmail(customerId, customerEmail);
        
        if (!user) {
            console.log('❌ User not found for transaction:', transaction.id);
            await flagForManualReview(customerId || customerEmail, 'transaction_completed_no_user');
            return;
        }
        
        if (user.status !== "active") {
            user.status = "active";
            console.log('🔧 User status corrected to active');
        }

        const subscriptionId = transaction.subscriptionId;
        console.log(subscriptionId, "subscriptionId_1")
        console.log(transaction, "transaction_1")
        if (subscriptionId) {
            user.subscriptionId = subscriptionId;
            console.log(subscriptionId, "subscriptionId_2")
            // 🎯 NOW fetch and set billing dates from Paddle API (since payment is confirmed)
            try {
                const subscription = await paddle.subscriptions.get(subscriptionId);
                if (subscription.billingCycle) {
                    user.billingCycle = subscription.billingCycle.interval === 'year' ? 'yearly' : 'monthly';
                }
                if (subscription.nextBilledAt) {
                    user.nextBillingDate = new Date(subscription.nextBilledAt);
                }
                if (subscription.currentBillingPeriod) {
                    user.subscriptionStart = new Date(subscription.currentBillingPeriod.startsAt);
                    user.subscriptionEnd = new Date(subscription.currentBillingPeriod.endsAt);
                }
                await user.save();
                console.log('📅 Billing dates set from API:', {
                    cycle: user.billingCycle,
                    nextBilling: user.nextBillingDate,
                    periodEnd: user.subscriptionEnd
                });
                
            } catch (apiError) {
                console.error('⚠️ Could not fetch subscription details from Paddle API:', apiError.message);
                // Continue without billing dates - they'll be set on next webhook
            }
        }

        user.lastWebhookProcessed = new Date(); 
        user.gracePeriodEnd = undefined;

        if (transaction.subscriptionId && (!user.subscriptionId || user.subscriptionId !== transaction.subscriptionId)) {
            user.subscriptionId = transaction.subscriptionId;
            console.log('🔄 Subscription ID updated:', transaction.subscriptionId);
        }
        
        if (!user.paymentHistory) user.paymentHistory = [];
        
        const existingTransaction = user.paymentHistory.find(
            payment => payment.transactionId === transaction.id
        );
        
        if (!existingTransaction) {
            user.paymentHistory.push({
                amount: transaction.details?.totals?.grandTotal || 0,
                date: new Date(transaction.createdAt),
                token_limit: user.token_limit,
                invoiceUrl: transaction.invoiceNumber || transaction.id,
                invoiceNumber: transaction.invoiceNumber,
                transactionId: transaction.id,
                subscriptionId: transaction.subscriptionId,
                type: transaction.subscriptionId ? 'subscription' : 'one-time',
                plan: user.plan,
                status: "success", 
                webhookReceived: true, 
                reconciled: true 
            });
        }else{
            existingTransaction.webhookReceived = true;
            existingTransaction.reconciled = true;
            existingTransaction.status = "success";
        }
        
        await user.save();
        
        // Send payment confirmation email with plan info
        await sendPaymentConfirmationEmail(transaction, user.email, user.plan);
        
        console.log('🏁 Payment FULLY processed:', {
            email: user.email,
            plan: user.plan,
            tokens: user.token_limit,
            subscriptionId: transaction.subscriptionId,
            invoiceNumber: transaction.invoiceNumber
        });
        
    } catch (error) {
        console.error('Error handling transaction completed:', error);
    }
}

// 4. Subscription Updated
async function handleSubscriptionUpdated(subscription) {
    try {
        console.log('🔄 Subscription updated:', subscription);
        
        const customerId = subscription.customerId;
        const user = await findUserByCustomerOrEmail(customerId);
        
        if (!user) {
            console.log('❌ User not found for subscription update');
            await flagForManualReview(customerId, 'subscription_updated_no_user');
            return;
        }

        user.lastWebhookProcessed = new Date();
        
        if (subscription.status === 'canceled' || subscription.canceledAt) {
            user.status = "inactive";
            user.plan = "free";
            user.token_limit = 0; // Reset to free tier tokens
            user.priceId='pri_';
            user.customerId='ctm_';
            user.subscriptionId='';
            user.gracePeriodEnd = null;
            user.nextBillingDate = null;
            user.subscriptionStart = null;
            user.subscriptionEnd = null;
            user.billingCycle = 'monthly';
            console.log('❌ Subscription canceled, downgraded to free plan:', user.email);
        }
        else if (subscription.status === 'active') {
            user.status = "active";
            // Update plan and token limits if price changed
            const priceId = subscription.items?.[0]?.price?.id;
            if (priceId && priceId !== user.priceId) {
                user.priceId = priceId;
                await setPlanAndTokenLimitsByPriceId(user, priceId);
                
                // Track token renewal for plan change
                const planConfig = PRICE_PLAN_CONFIG[priceId];
                if (planConfig && planConfig.token_limit !== null) {
                    user.lastTokenRenewal = new Date();
                    
                    // Add to renewal history
                    if (!user.tokenRenewalHistory) user.tokenRenewalHistory = [];
                    user.tokenRenewalHistory.push({
                        date: new Date(),
                        amount: planConfig.token_limit,
                        reason: 'plan_change'
                    });
                }
                
                console.log('🔄 Plan and token limits updated for user:', {
                    email: user.email,
                    newPlan: user.plan,
                    newTokens: user.token_limit
                });
            }


            // Handle subscription renewal (next_billed_at updated)
            if (subscription.next_billed_at) {
                user.nextBillingDate = new Date(subscription.next_billed_at);
                console.log('📅 Next billing date updated:', user.nextBillingDate);
            }

            if (subscription.billing_cycle) {
                user.billingCycle = subscription.billing_cycle.interval === 'year' ? 'yearly' : 'monthly';
            }
            
            // Update billing period dates (for renewals and changes)
            if (subscription.current_billing_period) {
                const newStart = new Date(subscription.current_billing_period.starts_at);
                const newEnd = new Date(subscription.current_billing_period.ends_at);
                
                // Only update if dates have actually changed (avoid unnecessary updates)
                if (!user.subscriptionStart || user.subscriptionStart.getTime() !== newStart.getTime() ||
                    !user.subscriptionEnd || user.subscriptionEnd.getTime() !== newEnd.getTime()) {
                    
                    user.subscriptionStart = newStart;
                    user.subscriptionEnd = newEnd;
                    
                    console.log('📆 Billing period updated:', {
                        start: user.subscriptionStart,
                        end: user.subscriptionEnd
                    });
                }
            }

        } else if (subscription.status === 'past_due') {
            user.status = "past_due";
            if (!user.gracePeriodEnd) {
                user.gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
            }
        }
        
        await user.save();
        
    } catch (error) {
        console.error('Error handling subscription updated:', error);
        throw error;
    }
}

// 5. Subscription Canceled
async function handleSubscriptionCanceled(subscription) {
    try {
        const customerId = subscription.customerId;
        const user = await findUserByCustomerOrEmail(customerId);
        
        if (user) {
            user.lastWebhookProcessed = new Date();
            user.gracePeriodEnd = undefined;
            user.status = "inactive";
            user.plan = "free";
            user.token_limit = 0; // Reset to free tier tokens
            user.priceId='pri_';
            user.customerId='ctm_';
            user.subscriptionId='';
            user.gracePeriodEnd = null;
            user.nextBillingDate = null;
            user.subscriptionStart = null;
            user.subscriptionEnd = null;
            user.billingCycle = 'monthly';

            await user.save();
            sendSubscriptionCancelEmail(user.email)
        }else{
            await flagForManualReview(customerId, 'subscription_canceled_no_user');
        }
        
    } catch (error) {
        console.error('Error handling subscription canceled:', error);
    }
}

// 6. Payment Failed
async function handlePaymentFailed(transaction) {
    try {
        console.log('💸 Payment failed:', transaction.id);
        
        const customerId = transaction.customerId;
        const user = await findUserByCustomerOrEmail(customerId);
        
        if (user) {
            user.lastWebhookProcessed = new Date(); // NEW: Track webhook processing
            
            // NEW: Add failed payment to history
            if (!user.paymentHistory) user.paymentHistory = [];
            user.paymentHistory.push({
                amount: transaction.details?.totals?.grandTotal || 0,
                date: new Date(transaction.createdAt),
                token_limit: user.token_limit,
                transactionId: transaction.id,
                status: "failed",
                failureReason: transaction.failureReason || "Payment failed",
                webhookReceived: true,
                reconciled: true
            });
            
            // NEW: Set grace period for failed payments
            if (!user.gracePeriodEnd) {
                user.gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
            }
            
            await user.save();
            sendPaymentFailedEmail(user.email);
            
            console.log('💸 Payment failure processed for user:', user.email);
        } else {
            await flagForManualReview(customerId, 'payment_failed_no_user');
        }
        
    } catch (error) {
        console.error('Error handling payment failed:', error);
        throw error; // Re-throw for webhook retry
    }
}

async function flagForManualReview(identifier, reason) {
    try {
        console.log('🚩 Flagging for manual review:', { identifier, reason });
        
        // You could save this to a separate collection or admin dashboard
        // For now, just log it with a specific format for easy searching
        console.error('MANUAL_REVIEW_NEEDED:', {
            timestamp: new Date().toISOString(),
            identifier,
            reason,
            requiresAction: true
        });
        
        // Optionally, you could create a ManualReview model to track these
        // await ManualReview.create({ identifier, reason, createdAt: new Date() });
        
    } catch (error) {
        console.error('Failed to flag for manual review:', error);
    }
}

// Function to send subscription cancellation email
async function sendSubscriptionCancelEmail(customerEmail, subscriptionEndDate = null) {
    try {
        await resend.emails.send({
            from: "contact@curiositylab.fun",
            to: [customerEmail],
            subject: 'Subscription Cancelled - Curiositylab',
            html: generateSubscriptionCancelEmailHTML(customerEmail, subscriptionEndDate)
        });
        
        console.log(`Subscription cancellation email sent to ${customerEmail}`);
    } catch (error) {
        console.log("Error sending subscription cancellation email:", error);
    }
}

async function sendPaymentFailedEmail(customerEmail) {
    try {
        await resend.emails.send({
            from: "contact@curiositylab.fun",
            to: [customerEmail],
            subject: 'Payment Failed - Curiositylab',
            html: generatePaymentFailedEmailHTML(customerEmail)
        });
        
        console.log(`Payment failed email sent to ${customerEmail}`);
    } catch (error) {
        console.log("Error sending payment failed email:", error);
    }
}

// Helper function to send payment confirmation email
async function sendPaymentConfirmationEmail(transaction, customerEmail, userPlan = null) {
    try {
        const grandTotal = transaction.details?.totals?.grandTotal || 0;
        const currencyCode = transaction.currencyCode || "USD";
        
        const billingPeriod = transaction.billingPeriod;
        let interval = "month";
        if (billingPeriod) {
            const startDate = new Date(billingPeriod.startsAt);
            const endDate = new Date(billingPeriod.endsAt);
            const daysDiff = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
            
            if (daysDiff <= 31) interval = "month";
            else if (daysDiff <= 366) interval = "year";
        }

        await resend.emails.send({
            from: "contact@curiositylab.fun",
            to: [customerEmail],
            subject: 'Payment Successful - Curiositylab',
            html: generatePaymentEmailHTML({
                success: true,
                price: grandTotal / 100,
                currency: currencyCode,
                quantity: transaction.items?.[0]?.quantity || 1,
                interval: interval,
                customerEmail: customerEmail,
                orderNumber: transaction.id,
                billing_reason: transaction.origin || "subscription_payment",
                plan: userPlan // Add plan info to email
            })
        });
    } catch (error) {
        console.log("Error sending payment confirmation email:", error);
    }
}

// UPDATED: Helper function to set both plan and token limits based on price ID
async function setPlanAndTokenLimitsByPriceId(user, priceId) {
    const planConfig = PRICE_PLAN_CONFIG[priceId];
    
    if (planConfig) {
        user.plan = planConfig.plan;
        
        // Special handling for custom_api users
        if (planConfig.plan === 'custom_api') {
            user.token_limit = 0; // No token limit for custom_api users
            console.log('🔑 Custom API user - no token limits applied');
        } else {
            user.token_limit = planConfig.token_limit;
        }
        
        console.log(`📋 Updated user plan: ${user.plan}, tokens: ${user.token_limit}`);
    } else {
        console.log(`⚠️ Unknown price ID: ${priceId}, setting to free plan`);
        user.plan = 'free';
        user.token_limit = 60;
    }
}

// DEPRECATED: Keep old function for backward compatibility but mark as deprecated
async function setTokenLimitsByPriceId(user, priceId) {
    console.warn('⚠️ setTokenLimitsByPriceId is deprecated, use setPlanAndTokenLimitsByPriceId instead');
    await setPlanAndTokenLimitsByPriceId(user, priceId);
}

module.exports = router;