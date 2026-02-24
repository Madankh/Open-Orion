const express = require("express");
const cors = require("cors");
const app = express();
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const port = 5000;
const passport = require("passport");
require("./router/PassportGoogleAuto");
const { createServer } = require("http");
const session = require("express-session");
// Import routes
const authUser = require('./router/auth');
const UserRouter = require('./router/user');
const DailyTokenRouter = require('./router/DailyTokenRouter');
const Webhook = require("./router/webhook");
const recoveryService = require('./router/paddleRecoverySystem');

// Load environment variables
dotenv.config();

// CORS configuration
const corsOptions = {
  methods: 'GET,POST,PATCH,DELETE,OPTIONS',
  optionsSuccessStatus: 200,
  origin: [
    // 'https://curiositylab.fun',
    'http://localhost:3000'
  ],
  credentials: true,
};

app.use(cors(corsOptions));
app.set("trust proxy", 1);
app.use(session({
  name: "sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // secure: process.env.NODE_ENV === "production",
    secure: false,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());


// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use("/api/auth", authUser);
app.use("/api/paddle", Webhook);
app.use("/api/user", UserRouter);
app.use("/api/token", DailyTokenRouter);

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));      
app.use(express.urlencoded({ extended: true }));

// Create server
const server = createServer(app);

// Database connection and recovery service initialization
mongoose.connect(process.env.MONGO_URL)
  .then(() => {
    console.log("DB connected successfully");
    
    // Start recovery service based on environment
    console.log("🚀 Starting Automatic Recovery Service...");
    
    // START THE RECOVERY MODES (this is what was missing!)
    const recoveryMode = process.env.RECOVERY_MODE || 'normal';
    
    if (recoveryMode === 'emergency') {
      recoveryService.startLostUserRecovery(); // Every 15 minutes
      console.log("🚨 EMERGENCY mode: Lost user recovery every 15 minutes");
    } else if (recoveryMode === 'aggressive') {
      recoveryService.startLostUserRecovery(); // Every 15 minutes
      recoveryService.startPeriodicDisasterRecovery(); // Every 2 hours
      console.log("🔥 AGGRESSIVE mode: Full recovery + lost user recovery");
    } else {
      // Normal mode
      recoveryService.startNormalMode(); // Every 2 hours, only if needed
      recoveryService.startLostUserRecovery(); // Every 15 minutes (lightweight)
      console.log("✅ NORMAL mode: Smart recovery + lost user recovery");
    }
    
    console.log("✅ Background recovery cron jobs are now active!");
    console.log(`📅 Recovery mode: ${recoveryMode}`);
  })
  .catch((error) => {
    console.error("Database connection failed:", error);
    process.exit(1);
  });

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}, gracefully shutting down...`);
  
  try {
    // Release recovery service lock
    await recoveryService.releaseLock();
    
    // Close database connection
    await mongoose.connection.close();
    
    // Close server
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

server.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});