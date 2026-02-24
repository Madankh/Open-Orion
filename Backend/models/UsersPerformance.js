const mongoose = require("mongoose");

const UsersPerformanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      required: true,
      index: true
    },
    date: {
      type: Date,
      default: Date.now,
      index: true
    },
    assessments: [
      {
        questionId: {
          type: String,
          required: true
        },
        topic: {
          type: String,
          required: true,
          index: true
        },
        difficulty: {
          type: String,
          enum: ["easy", "medium", "hard"],
          required: true
        },
        score: {
          type: Number,
          required: true,
          min: 0,
          max: 10
        },
        correctness: {
          type: String,
          enum: ["correct", "partially correct", "incorrect"],
          required: true
        },
        feedback: {
          type: String
        },
        studyTopics: [String]
      }
    ],
    summary: {
      totalScore: {
        type: Number,
        required: true
      },
      questionCount: {
        type: Number,
        required: true
      },
      overallFeedback: String
    },
    improvementMetrics: {
      previousAverageScore: {
        type: Number
      },
      scoreImprovement: {
        type: Number
      },
      consistentWeakAreas: [String],
      consistentStrengths: [String],
      studyTimeMinutes: {
        type: Number,
        default: 0
      }
    },
    streak: {
      current: {
        type: Number,
        default: 0
      },
      longest: {
        type: Number,
        default: 0
      },
      lastActiveDate: {
        type: Date
      }
    }
  },
  { timestamps: true }
);

// Compound index for efficient queries of performance over time
UsersPerformanceSchema.index({ userId: 1, date: -1 });

// Index for topic-based analysis
UsersPerformanceSchema.index({ userId: 1, "assessments.topic": 1 });

// Method to calculate improvement between two sessions
UsersPerformanceSchema.methods.calculateImprovement = function(previousPerformance) {
  if (!previousPerformance) return null;
  
  return {
    scoreChange: this.summary.percentageScore - previousPerformance.summary.percentageScore,
    topicImprovements: this.getTopicImprovements(previousPerformance)
  };
};

// Method to identify most improved topics
UsersPerformanceSchema.methods.getTopicImprovements = function(previousPerformance) {
  // Implementation would compare topic scores between sessions
  // This is a placeholder for the actual implementation
  return [];
};

// Static method to get performance trend
UsersPerformanceSchema.statics.getPerformanceTrend = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    { 
      $match: { 
        userId: new mongoose.Types.ObjectId(userId),
        date: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: { 
          $dateToString: { format: "%Y-%m-%d", date: "$date" } 
        },
        averageScore: { $avg: "$summary.percentageScore" },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
};

// Fix the module export
module.exports = mongoose.model("UsersPerformance", UsersPerformanceSchema);