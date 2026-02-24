const mongoose = require("mongoose");


const PaymentHistorySchema = new mongoose.Schema({
  amount: Number,
  date: Date,
  token_limit: Number,
  invoiceUrl: String,
  transactionId: String, // Paddle transaction ID for tracking
  status: {
    type: String,
    enum: ["success", "failed", "pending", "refunded", "cancelled"],
    default: "pending"
  },
  failureReason: String, // Store reason for failed payments
  webhookReceived: {
    type: Boolean,
    default: false
  },
  reconciled: {
    type: Boolean,
    default: false
  }
}, { _id: false });


const UserSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            unique: false
        },
        email: {
            type: String,
            required: true,
            unique: true
        },
        plan: {
            type: String,
            enum: ['free', 'basic', 'custom_api', 'mid', 'high'],
            default: 'free',
            required: true
        },
        customerId: {
            type: String,
            validate(value) {
                return value.includes("ctm_");
            },
            default: "ctm_" 
        },
        priceId: {
            type: String,
            validate(value) {
                return value.includes("pri_");
            },
            default: "pri_" 
        },
        subscriptionId: {
            type: String,
            default: ""
        },
        paymentHistory: [PaymentHistorySchema],
        password: {
            type: String,
            required: false
        },
        profile: {
            type: String,
            default: ""
        },
        status: {
            type: String,
            default: "inactive"
        },
        googleId: {
            type: String,
            default: ""
        },
        githubId: {
            type: String,
            default: ""
        },
        startAt: {
            type: Date
        },
        token_limit: {
            type: Number,
            required: true,
            default:30
        },
        lastTokenRenewal: { 
          type: Date,
          default: null},
        tokenRenewalHistory: [{
          date: Date,
          amount: Number,
          reason: String // 'renewal', 'missed_renewal', 'plan_change', etc.
        }],
        paymentDateAt: {
            type: Date,
            default: null 
        },
        paymentPendingDate: {
            type: Date,
            default: null 
        },
        
        subscriptionStart: { type: Date,default: null  },
        subscriptionEnd: { type: Date,default: null  },

        lastWebhookProcessed: {
          type: Date,
          default: null 
        },
        webhookFailures: {
          type: Number,
          default: 0
        },
        lastReconciliationCheck: {
          type: Date,
          default: null 
        },
        
        // Grace period for failed payments
        gracePeriodEnd: {
          type: Date,
          default: null 
        },
        isAdmin: {
          type: Boolean,
          default: false
        },
        // Billing cycle tracking
        billingCycle: {
          type: String,
          enum: ["monthly", "yearly"],
          default: "monthly"
        },
        nextBillingDate: {
          type: Date,
          default: null 
        },

        verified: {
            type: Boolean,
            default: false
        },
        resetPasswordToken: String,
        resetPasswordExpire: Date,
        lastResetDate: {
            type: Date,
            default: Date.now
        },

        requiresManualReview: {
            type: Boolean,
            default: false
        },
        notes: [String] // For admin notes during manual reviews
  
    },
    { timestamps: true }
);
UserSchema.virtual("needsReconciliation").get(function () {
  const latest = this.paymentHistory[this.paymentHistory.length - 1];
  const hasFailedWebhooks = this.webhookFailures > 0;
  const oldLastCheck = this.lastReconciliationCheck && 
    (Date.now() - this.lastReconciliationCheck) > 24 * 60 * 60 * 1000; // 24 hours
  
  return (
    !latest || 
    latest.status !== "success" || 
    !latest.webhookReceived ||
    hasFailedWebhooks ||
    oldLastCheck
  );
});

// Virtual: isInGracePeriod
UserSchema.virtual("isInGracePeriod").get(function () {
  return this.gracePeriodEnd && this.gracePeriodEnd > new Date();
});

// Virtual: shouldSuspend
UserSchema.virtual("shouldSuspend").get(function () {
  const latest = this.paymentHistory[this.paymentHistory.length - 1];
  const subscriptionExpired = this.subscriptionEnd && this.subscriptionEnd < new Date();
  const gracePeriodExpired = this.gracePeriodEnd && this.gracePeriodEnd < new Date();
  
  return (
    (latest && latest.status === "failed" && gracePeriodExpired) ||
    (subscriptionExpired && !this.isInGracePeriod)
  );
});

// Instance methods for payment management
UserSchema.methods.addPaymentRecord = function(paymentData) {
  this.paymentHistory.push({
    ...paymentData,
    date: new Date(),
    reconciled: false
  });
  
  if (paymentData.status === "success") {
    this.status = "active";
    this.webhookFailures = 0;
    this.gracePeriodEnd = undefined;
  }
  
  return this.save();
};

UserSchema.methods.markForReconciliation = function() {
  this.lastReconciliationCheck = new Date();
  this.webhookFailures += 1;
  
  // Set grace period for failed payments (7 days)
  if (!this.gracePeriodEnd) {
    this.gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  
  return this.save();
};

UserSchema.methods.reconcilePayment = function(paddleData) {
  const latest = this.paymentHistory[this.paymentHistory.length - 1];
  
  if (latest && !latest.reconciled) {
    latest.status = paddleData.status;
    latest.transactionId = paddleData.transactionId;
    latest.reconciled = true;
    latest.webhookReceived = true;
    
    if (paddleData.status === "success") {
      this.status = "active";
      this.subscriptionEnd = paddleData.subscriptionEnd;
      this.gracePeriodEnd = undefined;
    }
  }
  
  this.lastReconciliationCheck = new Date();
  this.webhookFailures = 0;
  
  return this.save();
};

// Indexes for efficient querying
UserSchema.index({ status: 1, subscriptionEnd: 1 });
UserSchema.index({ lastReconciliationCheck: 1 });
UserSchema.index({ webhookFailures: 1 });
UserSchema.index({ gracePeriodEnd: 1 });
UserSchema.index({ "paymentHistory.status": 1 });
UserSchema.index({ customerId: 1 });
UserSchema.index({ subscriptionId: 1 });

module.exports = mongoose.model("User", UserSchema);