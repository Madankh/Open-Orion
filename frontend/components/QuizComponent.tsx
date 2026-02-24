"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Brain, CheckCircle, XCircle, Lightbulb, Send } from "lucide-react";

// Types for quiz data
interface QuizQuestion {
  adaptive_reasoning: string;
  answer: string;
  difficulty: "easy" | "medium" | "hard";
  estimated_time: number;
  explanation: string;
  hints: string[];
  options: string[];
  question: string;
  topic: string;
  type: "multiple_choice" | "true_false" | "short_answer" | "essay";
}

interface AdaptiveQuestionData {
  adaptation_strategy: string;
  content: string;
  learning_objectives: string[];
  questions: QuizQuestion[];
}

interface QuizComponentProps {
  quizData: AdaptiveQuestionData;
  onSubmitQuiz: (message: string, modelId: string,modeId:string) => void;
  selectedModelId: string;
  className?: string;
}

interface QuestionAnswerState {
  [questionIndex: number]: {
    selectedAnswer: string;
    isAnswered: boolean;
    showExplanation: boolean;
  };
}

const QuizComponent: React.FC<QuizComponentProps> = ({ 
  quizData, 
  onSubmitQuiz, 
  selectedModelId,
  className = "" 
}) => {
  const [questionStates, setQuestionStates] = useState<QuestionAnswerState>({});
  const [allQuestionsAnswered, setAllQuestionsAnswered] = useState<boolean>(false);

  // Helper function to normalize answers for comparison
  const normalizeAnswer = (answer: string): string => {
    if (!answer) return '';
    return answer.toString().toLowerCase().trim().replace(/\s+/g, ' ');
  };

  // Answer comparison logic (only used for multiple choice)
  const compareAnswers = (userAnswer: string, correctAnswer: string): boolean => {
    if (!userAnswer || !correctAnswer) return false;

    const normUser = normalizeAnswer(userAnswer);
    const normCorrect = normalizeAnswer(correctAnswer);

    // Direct match
    if (normUser === normCorrect) {
      return true;
    }

    // Extract option letter/number from user answer (e.g., "A)" from "A) Linear regression")
    const userChoiceMatch = userAnswer.match(/^([A-Z])\)/i);
    const userChoiceLetter = userChoiceMatch ? userChoiceMatch[1].toLowerCase() : null;

    // Extract option letter/number from correct answer
    const correctChoiceMatch = correctAnswer.match(/^([A-Z])\)?/i);
    const correctChoiceLetter = correctChoiceMatch ? correctChoiceMatch[1].toLowerCase() : null;

    // Compare just the letters (A, B, C, D)
    if (userChoiceLetter && correctChoiceLetter) {
      return userChoiceLetter === correctChoiceLetter;
    }

    // Fallback: check if correct answer is contained in user answer
    if (normCorrect.length > 1 && normUser.includes(normCorrect)) {
      return true;
    }

    return false;
  };

  // Use useEffect to properly track when all questions are answered
  useEffect(() => {
    if (!quizData?.questions || quizData.questions.length === 0) return;
    
    const answeredQuestions = Object.keys(questionStates).filter(key => 
      questionStates[parseInt(key)]?.isAnswered
    );
    
    const totalAnswered = answeredQuestions.length;
    const shouldEnableSubmit = totalAnswered === quizData.questions.length && totalAnswered > 0;
    
    if (shouldEnableSubmit !== allQuestionsAnswered) {
      setAllQuestionsAnswered(shouldEnableSubmit);
    }
  }, [questionStates, quizData?.questions?.length, allQuestionsAnswered]);

  // Handle answer selection for multiple choice - show immediate feedback
  const handleAnswerSelect = (questionIndex: number, selectedAnswer: string): void => {
    if (!quizData?.questions?.[questionIndex]) return;
    
    setQuestionStates(prev => ({
      ...prev,
      [questionIndex]: {
        selectedAnswer: selectedAnswer.trim(),
        isAnswered: true,
        showExplanation: true 
      }
    }));
  };

  // Handle text input for short answer questions - NO immediate feedback
  const handleTextAnswerChange = (questionIndex: number, value: string): void => {
    setQuestionStates(prev => ({
      ...prev,
      [questionIndex]: {
        selectedAnswer: value,
        isAnswered: value.trim().length > 0,
        showExplanation: false // For text answers, don't show explanation until AI analysis
      }
    }));
  };


  // Submit all answers to parent for AI analysis
  const handleSubmitAllAnswers = (): void => {
    try {
      if (!quizData?.questions || !Array.isArray(quizData.questions)) {
        throw new Error("Invalid quiz data: missing questions array");
      }

      if (typeof onSubmitQuiz !== 'function') {
        throw new Error("onSubmitQuiz callback is not defined or not a function");
      }

      const answers: Record<number, string> = {};
      Object.keys(questionStates).forEach(key => {
        const index = parseInt(key);
        if (questionStates[index]?.isAnswered) {
          answers[index] = questionStates[index].selectedAnswer;
        }
      });

      if (Object.keys(answers).length === 0) {
        throw new Error("No answers found to submit");
      }

      const quizResultMessage = `
Quiz Completed: ${quizData.content || 'Quiz'}

Student Answers:
${Object.entries(answers).map(([questionIndex, answer], idx) => {
  const question = quizData.questions[parseInt(questionIndex)];
  if (!question) {
    return `Question ${idx + 1}: [Question data missing]`;
  }
  
  // For multiple choice, we can show if it was correct/incorrect
  // For text answers, let AI analyze
  const isMultipleChoice = question.type === "multiple_choice";
  const statusInfo = isMultipleChoice 
    ? `Status: ${compareAnswers(answer, question.answer) ? '✅ Correct' : '❌ Incorrect'}`
    : 'Status: Pending AI Analysis';
  
  return `
Question ${idx + 1} (${question.type}): ${question.question || '[No question text]'}
Student Answer: ${answer || '[No answer]'}
Correct Answer: ${question.answer || '[No correct answer]'}
${statusInfo}
Difficulty: ${question.difficulty || 'unknown'}
Topic: ${question.topic || 'general'}
`;
}).join('\n')}

Learning Objectives Covered:
${(quizData.learning_objectives && Array.isArray(quizData.learning_objectives)) 
  ? quizData.learning_objectives.map(obj => `• ${obj}`).join('\n')
  : '• No learning objectives specified'
}

Please provide comprehensive feedback and recommendations for improvement based on these quiz results. Pay special attention to the text/short answer questions which need your analysis for correctness.
      `.trim();

      onSubmitQuiz(quizResultMessage, selectedModelId, 0 || 'default-model');
      
    } catch (error) {
      console.error("Error submitting quiz:", error);
      alert(`Error submitting quiz: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Get difficulty color
  const getDifficultyColor = (difficulty: string): string => {
    switch (difficulty) {
      case "easy": return "text-green-600 bg-green-100";
      case "medium": return "text-yellow-600 bg-yellow-100";
      case "hard": return "text-red-600 bg-red-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  // Return error if no questions
  if (!quizData?.questions || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
    return (
      <div className={`quiz-container bg-white rounded-lg border border-red-200 shadow-sm p-6 ${className}`}>
        <div className="text-center">
          <XCircle className="size-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-800 mb-2">Quiz Data Error</h3>
          <p className="text-red-600">No quiz questions found. Please check the quiz data.</p>
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(questionStates).filter(key => 
    questionStates[parseInt(key)]?.isAnswered
  ).length;

  return (
    <motion.div
      className={`quiz-container bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Quiz Header */}
      <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="size-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-800">{quizData.content || 'Quiz'}</h3>
        </div>
        {quizData.adaptation_strategy && (
          <p className="text-sm text-gray-600 mb-2">{quizData.adaptation_strategy}</p>
        )}
        
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>Progress:</span>
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: `${(answeredCount / quizData.questions.length) * 100}%` 
              }}
            />
          </div>
          <span>{answeredCount} / {quizData.questions.length}</span>
        </div>
      </div>

      {/* Learning Objectives */}
      {quizData.learning_objectives && Array.isArray(quizData.learning_objectives) && quizData.learning_objectives.length > 0 && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Learning Objectives:</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            {quizData.learning_objectives.map((objective, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span>{objective}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Questions */}
      <div className="p-4 space-y-6">
        {quizData.questions.map((question, questionIndex) => {
          const questionState = questionStates[questionIndex];
          const isAnswered = questionState?.isAnswered || false;
          const showExplanation = questionState?.showExplanation || false;
          const selectedAnswer = questionState?.selectedAnswer || "";
          
          // Only determine correctness for multiple choice questions
          const isMultipleChoice = question.type === "multiple_choice";
          const isCorrectAnswer = isMultipleChoice && isAnswered ? compareAnswers(selectedAnswer, question.answer) : false;

          return (
            <motion.div
              key={questionIndex}
              className="question-block border border-gray-200 rounded-lg p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: questionIndex * 0.1 }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-1 rounded">
                      Q{questionIndex + 1}
                    </span>
                    {question.difficulty && (
                      <span className={`text-xs font-medium px-2 py-1 rounded ${getDifficultyColor(question.difficulty)}`}>
                        {question.difficulty}
                      </span>
                    )}
                    {question.estimated_time && (
                      <span className="text-xs text-gray-500">⏱️ {question.estimated_time} min</span>
                    )}
                    <span className="text-xs text-gray-500 capitalize">
                      {question.type?.replace('_', ' ') || 'question'}
                    </span>
                  </div>
                  <h4 className="text-base font-medium text-gray-900 leading-relaxed">
                    {question.question || '[No question text]'}
                  </h4>
                </div>
              </div>

              {/* Multiple Choice Options - WITH immediate feedback */}
              {question.type === "multiple_choice" && (
                <div className="space-y-2 mb-4">
                  {question.options && Array.isArray(question.options) && question.options.length > 0 ? (
                    question.options.map((option, optionIndex) => {
                      const isSelected = selectedAnswer === option;
                      const isThisOptionCorrect = compareAnswers(option, question.answer);
                      const isIncorrect = showExplanation && isSelected && !isCorrectAnswer;

                      return (
                        <button
                          key={optionIndex}
                          onClick={() => !isAnswered && handleAnswerSelect(questionIndex, option)}
                          disabled={isAnswered}
                          className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                            isAnswered
                              ? isThisOptionCorrect
                                ? "border-green-500 bg-green-50 text-green-800"
                                : isIncorrect
                                ? "border-red-500 bg-red-50 text-red-800"
                                : "border-gray-200 bg-gray-50 text-gray-700"
                              : isSelected
                              ? "border-blue-500 bg-blue-50 text-blue-800"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-800"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isAnswered
                                ? isThisOptionCorrect
                                  ? "border-green-500 bg-green-500"
                                  : isIncorrect
                                  ? "border-red-500 bg-red-500"
                                  : "border-gray-300"
                                : isSelected
                                ? "border-blue-500 bg-blue-500"
                                : "border-gray-300"
                            }`}>
                              {(isSelected || (showExplanation && isThisOptionCorrect)) && (
                                <div className="w-2 h-2 rounded-full bg-white" />
                              )}
                            </div>
                            <span className="flex-1 text-gray-900">{option}</span>
                            {showExplanation && isThisOptionCorrect && (
                              <CheckCircle className="size-5 text-green-600" />
                            )}
                            {isIncorrect && (
                              <XCircle className="size-5 text-red-600" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-700">No options available for this question.</p>
                    </div>
                  )}
                </div>
              )}

              {(question.type === "short_answer" || question.type === "essay") && (
                <div className="mb-4">
                  <textarea
                    value={selectedAnswer}
                    onChange={(e) => handleTextAnswerChange(questionIndex, e.target.value)}
                    placeholder={question.type === "essay" ? "Write your detailed essay answer here..." : "Type your answer here..."}
                    className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    rows={question.type === "essay" ? 6 : 3}
                    disabled={false}
                  />
                  {isAnswered && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-sm text-blue-700 flex items-center gap-2">
                        <CheckCircle className="size-4" />
                        Answer submitted. It will be analyzed when you submit the complete quiz.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* True/False - treat like multiple choice with immediate feedback */}
              {question.type === "true_false" && (
                <div className="space-y-2 mb-4">
                  {["True", "False"].map((option) => {
                    const isSelected = selectedAnswer === option;
                    const isThisOptionCorrect = compareAnswers(option, question.answer);
                    const isIncorrect = showExplanation && isSelected && !isCorrectAnswer;

                    return (
                      <button
                        key={option}
                        onClick={() => !isAnswered && handleAnswerSelect(questionIndex, option)}
                        disabled={isAnswered}
                        className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                          isAnswered
                            ? isThisOptionCorrect
                              ? "border-green-500 bg-green-50 text-green-800"
                              : isIncorrect
                              ? "border-red-500 bg-red-50 text-red-800"
                              : "border-gray-200 bg-gray-50 text-gray-700"
                            : isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-800"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isAnswered
                              ? isThisOptionCorrect
                                ? "border-green-500 bg-green-500"
                                : isIncorrect
                                ? "border-red-500 bg-red-500"
                                : "border-gray-300"
                              : isSelected
                              ? "border-blue-500 bg-blue-500"
                              : "border-gray-300"
                          }`}>
                            {(isSelected || (showExplanation && isThisOptionCorrect)) && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <span className="flex-1 text-gray-900 font-medium">{option}</span>
                          {showExplanation && isThisOptionCorrect && (
                            <CheckCircle className="size-5 text-green-600" />
                          )}
                          {isIncorrect && (
                            <XCircle className="size-5 text-red-600" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Hints - show before answering */}
              {!showExplanation && question.hints && Array.isArray(question.hints) && question.hints.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="size-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">Hints:</span>
                  </div>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    {question.hints.map((hint, hintIndex) => (
                      <li key={hintIndex} className="flex items-start gap-2">
                        <span className="text-yellow-600 mt-0.5">•</span>
                        <span>{hint}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Explanation - ONLY for multiple choice and true/false */}
              {showExplanation && isMultipleChoice && question.explanation && (
                <motion.div
                  className={`mt-4 p-4 rounded-lg border ${
                    isCorrectAnswer 
                      ? "bg-green-50 border-green-200" 
                      : "bg-red-50 border-red-200"
                  }`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-1 rounded-full ${
                      isCorrectAnswer ? "bg-green-500" : "bg-red-500"
                    }`}>
                      {isCorrectAnswer ? (
                        <CheckCircle className="size-4 text-white" />
                      ) : (
                        <XCircle className="size-4 text-white" />
                      )}
                    </div>
                    <span className="font-medium text-gray-800">
                      {isCorrectAnswer ? "Correct!" : "Incorrect"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{question.explanation}</p>
                  
                  {/* Only show correct answer if the user was wrong */}
                  {!isCorrectAnswer && question.answer && (
                    <div className="mt-3 p-2 bg-green-100 border border-green-200 rounded">
                      <p className="text-sm text-green-800">
                        <strong>Correct answer:</strong> {question.answer}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* For text answers, just show that it's ready for AI analysis */}
              {question.type === "short_answer" && isAnswered && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-700">
                    📝 Your answer has been recorded and will be evaluated by AI when you submit the complete quiz.
                  </p>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Submit Button */}
      {allQuestionsAnswered && (
        <motion.div
          className="p-4 border-t border-gray-100 bg-gray-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <button
            onClick={handleSubmitAllAnswers}
            className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Send className="size-5" />
            Submit Quiz for AI Analysis
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            The AI will analyze all your answers and provide comprehensive feedback
          </p>
        </motion.div>
      )}
    </motion.div>
  );
};

export default QuizComponent;