const express = require("express");
const router = require("express").Router();
router.use(express.static('public'));
router.use(express.urlencoded({ extended: true }));
router.use(express.json());
const User = require("..//models/User");
const jwt = require('jsonwebtoken');
const { verifyToken, verifyTokenAndAdmin } = require("./verifyToken");
const { Paddle, Environment,CustomerPortalSession } = require("@paddle/paddle-node-sdk");
const paddle = new Paddle(process.env.PADDLE_SECRET_TOKEN, {
  environment: Environment.sandbox,
});
const passport = require("passport");
const { Resend } = require('resend');
const resend = new Resend(process.env.RESENDAPI);

const recoveryService = require('../router/paddleRecoverySystem');

require("dotenv").config();
const dotenv = require("dotenv");
dotenv.config();

const { isUserAuthenticated } = require("./middlewares");

router.get('/login/google',
  passport.authenticate('google', { scope: ['profile' , 'email'] })
);

// router.get(
//   "/google/callback",
//   passport.authenticate("google", {
//     failureMessage: "Cannot login to Google, please try again later!",
//     successRedirect:"https://curiositylab.fun/canvas",
//       failureRedirect:"https://curiositylab.fun/login"
//     }),
//     (req, res) => {
//       res.redirect("https://curiositylab.fun/canvas")
// })


router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureMessage: "Cannot login to Google, please try again later!",
    successRedirect:"http://localhost:3000/canvas",
      failureRedirect:"http://localhost:3000/login"
    }),
    (req, res) => {
      res.redirect("http://localhost:3000/canvas")
})

router.get("/login/failed" , (req , res)=>{
    res.status(401).json({
        success:false,
        message:"failure",
    });
});

router.get("/login/success", isUserAuthenticated , (req , res)=>{
    console.log("Current User:", req.user);  

    if(req.user){
        const accessToken = jwt.sign({
            id: req.user._id,
            username:req.user.username,
            isGoogleUser:true
        }, process.env.JWT_SEC);

        res.status(200).json({user:req.user , accessToken});
    } else {
        res.status(401).json({message: "Not Authenticated"});
    }
});

router.get("/user/:id", verifyToken, async(req, res) => {
    try {
        // Only allow users to access their own data (unless admin)
        if(req.user.id !== req.params.id && !req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const user = await User.findById(req.params.id);
        if(!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Return only safe data
        const safeUserData = {
            _id: user._id,
            username: user.username,
            email: user.email,
            plan: user.plan,
            status: user.status,
            verified: user.verified,
            isAdmin: user.isAdmin,
            token_limit: user.token_limit,
            subscriptionEnd: user.subscriptionEnd,
            paymentHistory: user.paymentHistory?.map(payment => ({
                amount: payment.amount,
                date: payment.date,
                token_limit: payment.token_limit,
                hasInvoice: !!payment.invoiceUrl
            })) || []
            
        };
        
        return res.status(200).json(safeUserData);

    } catch (error) {
        console.error('Error fetching user:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

router.get("/subscribe",verifyToken, async (req, res) => {
  const plan = req.query.plan;
  let user = await User.findById(req.user.id);
  console.log(user, "user")
  let email = user.email;
  console.log(email, "email")
  if (!plan) {
      return res.send('Subscription plan not found')
  }
  
  // Map your plan to Paddle Price ID
  let priceId;
  switch (plan) {
    case "basic":
      priceId = "price1"; 
      break;
    case "medium":
      priceId = "price2"; 
      break;
    case "onetime":
      priceId = "price3"; 
      break;

    default:
      return res.send("Invalid plan");
  }

  const txn = await paddle.transactions.create({
    items: [
      {
        price_id: priceId,
        quantity: 1,
      },
    ],
    customer: {
      email: email, 
    },
    redirect_url: `${process.env.BASE_URL}/success`,
  });
  console.log(txn)
  res.redirect(txn.url);
});

async function createCustomerPortalSession(customerId, subscriptionIds){
    try {
        const session = await paddle.customerPortalSessions.create(customerId, subscriptionIds)
        return session
        // Returns a customer portal session entity
    } catch (e) {
        console.error('Error creating customer portal session:', e)
        // Handle Network/API errors
    }
}

router.get("/generate-portal",verifyToken, async (req, res) => {
  try {
    // You can fetch user from JWT or session middleware
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user || !user.customerId) {
      return res.status(404).json({ error: "User or customer ID not found" });
    }

    const newSession = await createCustomerPortalSession(user.customerId, [user.subscriptionId])
    console.log("New Customer Portal Session:", newSession.urls.general.overview)

    return res.json({ url: newSession.urls.general.overview });

  } catch (err) {
    console.error("Error generating customer portal session:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Search a user in order to create a group
router.get("/get/search/user" , verifyToken , async(req, res)=>{
    try {

    const keyword = req.query.search
    ? {
        $or: [
          { username: { $regex: req.query.search, $options: "i" } },
          { email: { $regex: req.query.search, $options: "i" } },
        ],
      }
    : {};

  const users = await User.find(keyword).find({ _id: { $ne: req.user.id } });
  return res.status(200).json(users);      
} catch (error) {
      return res.status(500).json("Internal server error")  
}
})

router.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);

    req.session.destroy(() => {
      res.clearCookie("sid", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      res.status(200).json({ message: "Logged out successfully" });
    });
  });
});


// Recovery monitoring endpoints
router.get("/api/recovery/status",verifyTokenAndAdmin, (req, res) => {
  res.json({
    isRunning: recoveryService.isRunning,
    errorCount: recoveryService.errorCount,
    mode: process.env.RECOVERY_MODE || "normal",
    schedule: "Automatic background recovery active"
  });
});

router.post("/recovery/trigger",verifyTokenAndAdmin, async (req, res) => {
  try {
    if (recoveryService.isRunning) {
      return res.status(409).json({ error: "Recovery already running" });
    }

    // Trigger emergency recovery
    recoveryService.runRecoveryWithLock('disaster-recovery').catch(error => {
      console.error('Manual recovery failed:', error);
    });

    res.json({ message: "Emergency recovery triggered" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// Helper function to generate title from message
function generateTitleFromMessage(message, type) {
  // Take first 50 characters and clean it up
  let title = message.trim().split('\n')[0].substring(0, 50);
  
  // Remove common starting words
  title = title.replace(/^(hi|hello|hey|dear|support|team|bug|issue|problem|help)/i, '').trim();
  
  // Add type prefix
  const prefix = type === 'bug' ? '🐛 Bug:' : '💬 Support:';
  
  return `${prefix} ${title}${title.length >= 50 ? '...' : ''}`;
}


// Simple report form
router.post("/bug/report",verifyToken, async (req, res) => {
  try {
    const { name, email, message, type } = req.body;
    
    if (!email || !message) {
      return res.status(400).json({ error: "Email and message are required" });
    }

    // Auto-generate title from message
    const autoTitle = generateTitleFromMessage(message, type);
    
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New ${type === 'bug' ? 'Bug Report' : 'Support Request'}</h2>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
          <p><strong>From:</strong> ${name || 'Not provided'} (${email})</p>
          <p><strong>Type:</strong> ${type === 'bug' ? 'Bug Report' : 'General Support'}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div style="background: white; padding: 20px; border: 1px solid #e1e5e9; border-radius: 5px;">
          <h3 style="color: #333; margin-top: 0;">Message:</h3>
          <div style="line-height: 1.6; color: #555;">
            ${message.replace(/\n/g, '<br>')}
          </div>
        </div>
        
        <div style="margin-top: 20px; padding: 15px; background: #e8f4fd; border-radius: 5px;">
          <p style="margin: 0; color: #0066cc;">
            <strong>💡 Tip:</strong> You can reply directly to this email to contact the user.
          </p>
        </div>
      </div>
    `;

    let result = await resend.emails.send({
      from: "contact@curiositylab.fun",
      to: ["khadkasuman0000@gmail.com"], // Your support email
      replyTo: email,
      subject: autoTitle,
      html: emailBody
    });
    console.log("Resend send result:", result);
    res.json({ 
      message: "Message sent successfully! We'll get back to you soon.",
      generatedTitle: autoTitle
    });

  } catch (error) {
    console.error("Error sending support message:", error);
    res.status(500).json({ 
      error: "Failed to send message. Please try again or email us directly at support@curiositylab.fun" 
    });
  }
});

module.exports = router;
