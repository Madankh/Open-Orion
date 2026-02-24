from typing import Any, Optional, List, Dict
import json
import uuid
import logging
from datetime import datetime
from llm.message_history import MessageHistory
from lab.base import AgentPlugin, AgentImplOutput

logger = logging.getLogger(__name__)

class AdaptiveQuestionGenerator(AgentPlugin):
    """Tool for AI agent to generate adaptive questions based on student profile.
    
    The AI agent uses this tool to structure and validate question generation,
    while the agent itself does the actual question creation using its intelligence.
    """
    
    name = "AdaptiveQuestionGenerator"
    description = """\
   This tool helps the AI agent structure adaptive question generation that targets student needs.
   
   SUPPORTED QUESTION TYPES:
   1. multiple_choice - Questions with 3-5 options (ideal for concept testing)
   2. true_false - Binary true/false questions (good for quick comprehension checks)
   3. short_answer - Brief text responses (2-3 sentences, tests understanding)
   4. essay - Long-form written responses (detailed analysis, 5+ sentences)

   
   WHEN TO USE EACH TYPE:
   - Use "multiple_choice" for: concept identification, comparing options, testing knowledge recall
   - Use "true_false" for: quick fact verification, misconception checks
   - Use "short_answer" for: explanations, definitions, step-by-step reasoning
   - Use "essay" for: complex analysis, comparing concepts, detailed explanations, critical thinking
   
   The AI agent should provide:
   - Generated questions with proper structure and correct question type
   - Adaptation reasoning based on student profile
   - Difficulty progression that matches student level
   - Question types that suit learning style and content complexity
   
   Use this tool when:
   - Student needs practice questions on specific topics
   - Adapting question difficulty based on performance history
   - Targeting weak areas for improvement
   - Creating questions that match learning preferences
   - Providing immediate feedback and explanations
   
   IMPORTANT: Always set the "type" field to one of the supported types above.
   For detailed, analytical questions requiring paragraph responses, use "essay" type.
   For quick factual answers, use "short_answer" type.
   """
    
    input_schema = {
        "type": "object",
        "properties": {
            "content": {
                "type": "string", 
                "description": "Learning material content or topic to generate questions about"
            },
            "student_profile": {
                "type": "object",
                "properties": {
                    "weak_areas": {
                        "type": "array", 
                        "items": {"type": "string"},
                        "description": "Topics the student struggles with"
                    },
                    "strong_areas": {
                        "type": "array", 
                        "items": {"type": "string"},
                        "description": "Topics the student excels at"
                    },
                    "preferred_difficulty": {
                        "type": "string", 
                        "enum": ["easy", "medium", "hard"],
                        "description": "Student's preferred difficulty level"
                    },
                    "learning_style": {
                        "type": "string", 
                        "enum": ["visual", "auditory", "kinesthetic", "reading"],
                        "description": "Student's preferred learning style"
                    },
                    "average_score": {
                        "type": "number",
                        "minimum": 0.0,
                        "maximum": 1.0,
                        "description": "Student's average performance score (0.0 to 1.0)"
                    },
                    "recent_mistakes": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Recent mistakes or misconceptions"
                    }
                },
                "description": "Student learning profile for adaptation"
            },
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "question": {"type": "string", "description": "The question text"},
                        "type": {
                            "type": "string", 
                            "enum": ["multiple_choice", "true_false", "short_answer", "essay", "fill_blank", "matching"],
                            "description": "Type of question"
                        },
                        "answer": {"type": "string", "description": "Correct answer"},
                        "options": {
                            "type": "array", 
                            "items": {"type": "string"},
                            "description": "Multiple choice options (if applicable)"
                        },
                        "difficulty": {
                            "type": "string", 
                            "enum": ["easy", "medium", "hard"],
                            "description": "Question difficulty level"
                        },
                        "topic": {"type": "string", "description": "Specific topic covered"},
                        "explanation": {"type": "string", "description": "Why this answer is correct"},
                        "hints": {
                            "type": "array", 
                            "items": {"type": "string"},
                            "description": "Helpful hints for the student"
                        },
                        "estimated_time": {
                            "type": "integer",
                            "description": "Estimated time to answer in minutes"
                        },
                        "adaptive_reasoning": {
                            "type": "string",
                            "description": "Why this question targets the student's needs"
                        }
                    },
                    "required": ["question", "type", "answer", "difficulty", "topic"]
                },
                "description": "Array of questions generated by the AI agent"
            },
            "adaptation_strategy": {
                "type": "string",
                "description": "Explanation of how questions were adapted for this student"
            },
            "learning_objectives": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Learning objectives these questions address"
            }
        },
        "required": ["content", "questions"]
    }
    
    output_schema = {
        "type": "object",
        "properties": {
            "status": {"type": "string", "enum": ["success", "error"]},
            "processed_questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "question": {"type": "string"},
                        "type": {"type": "string"},
                        "answer": {"type": "string"},
                        "options": {"type": "array", "items": {"type": "string"}},
                        "difficulty": {"type": "string"},
                        "topic": {"type": "string"},
                        "subject": {"type": "string"},
                        "explanation": {"type": "string"},
                        "hints": {"type": "array", "items": {"type": "string"}},
                        "estimated_time": {"type": "integer"},
                        "adaptive_reasoning": {"type": "string"}
                    }
                }
            },
            "adaptation_summary": {"type": "string"},
            "learning_objectives": {"type": "array", "items": {"type": "string"}},
            "recommended_next_steps": {"type": "array", "items": {"type": "string"}},
            "difficulty_distribution": {"type": "object"},
            "total_questions": {"type": "integer"}
        }
    }

    def __init__(self, verbose: bool = False):
        """Initialize the adaptive question generator tool."""
        super().__init__()
        self.verbose = verbose
        self.generation_history: List[Dict] = []

    async def run_impl(
        self,
        tool_input: Dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        """Process AI-generated questions and structure them properly.
        
        Args:
            tool_input: Input containing questions generated by AI agent
            message_history: Optional dialog messages
            
        Returns:
            Structured and validated question output
        """
        try:
            logger.debug(f"Adaptive question generator input: {tool_input}")
            
            # Extract input data
            content = tool_input.get("content", "")
            student_profile = tool_input.get("student_profile", {})
            questions = tool_input.get("questions", [])
            adaptation_strategy = tool_input.get("adaptation_strategy", "")
            learning_objectives = tool_input.get("learning_objectives", [])
            
            # Validate and process questions
            processed_questions = self._process_questions(questions, content, student_profile)
            
            # Generate analytics
            difficulty_distribution = self._analyze_difficulty_distribution(processed_questions)
            adaptation_summary = self._create_adaptation_summary(student_profile, processed_questions, adaptation_strategy)
            recommended_next_steps = self._generate_recommendations(student_profile, processed_questions)
            
            # Prepare response
            response_data = {
                "status": "success",
                "processed_questions": processed_questions,
                "adaptation_summary": adaptation_summary,
                "learning_objectives": learning_objectives,
                "recommended_next_steps": recommended_next_steps,
                "difficulty_distribution": difficulty_distribution,
                "total_questions": len(processed_questions)
            }
            
            # Create user message
            weak_areas = student_profile.get("weak_areas", [])
            focus_text = f"focusing on {', '.join(weak_areas[:2])}" if weak_areas else "covering key concepts"
            message = f"✅ Generated {len(processed_questions)} adaptive questions {focus_text}"
            
            if self.verbose:
                logger.info(f"Generated {len(processed_questions)} questions with difficulty distribution: {difficulty_distribution}")
            
            return AgentImplOutput(
                tool_output=json.dumps(response_data, indent=2),
                tool_result_message=message,
                auxiliary_data={
                    "structured_data": response_data,
                    "success": True,
                    "question_count": len(processed_questions),
                    "adaptation_applied": bool(student_profile)
                }
            )
            
        except Exception as e:
            logger.error(f"Error in adaptive question generator: {str(e)}")
            error_response = {
                "status": "error",
                "error_message": str(e),
                "processed_questions": [],
                "total_questions": 0
            }
            return AgentImplOutput(
                tool_output=json.dumps(error_response, indent=2),
                tool_result_message=f"❌ Error processing questions: {str(e)}",
                auxiliary_data={"error": str(e), "success": False}
            )

    def _process_questions(self, questions: List[Dict], content: str, student_profile: Dict) -> List[Dict]:
        """Process and validate AI-generated questions."""
        processed = []
        subject = self._extract_subject_from_content(content)
        
        for i, question_data in enumerate(questions):
            # Validate required fields
            if not self._validate_question(question_data):
                logger.warning(f"Skipping invalid question {i+1}: {question_data}")
                continue
            
            # Add missing fields
            processed_question = {
                "id": str(uuid.uuid4())[:8],
                "question": question_data["question"],
                "type": question_data["type"],
                "answer": question_data["answer"],
                "difficulty": question_data["difficulty"],
                "topic": question_data["topic"],
                "subject": subject,
                "explanation": question_data.get("explanation", ""),
                "hints": question_data.get("hints", []),
                "estimated_time": question_data.get("estimated_time", self._estimate_time(question_data)),
                "adaptive_reasoning": question_data.get("adaptive_reasoning", ""),
                "options": question_data.get("options", []) if question_data["type"] == "multiple_choice" else []
            }
            
            processed.append(processed_question)
        
        return processed

    def _validate_question(self, question: Dict) -> bool:
        """Validate that a question has required fields."""
        required_fields = ["question", "type", "answer", "difficulty", "topic"]
        return all(field in question and question[field] for field in required_fields)

    def _estimate_time(self, question: Dict) -> int:
        """Estimate time needed for a question based on type and difficulty."""
        base_times = {
            "multiple_choice": 2,
            "true_false": 1,
            "short_answer": 4,
            "essay": 10,
            "fill_blank": 2,
            "matching": 3
        }
        
        difficulty_multipliers = {
            "easy": 0.8,
            "medium": 1.0,
            "hard": 1.5
        }
        
        base_time = base_times.get(question.get("type", "short_answer"), 3)
        multiplier = difficulty_multipliers.get(question.get("difficulty", "medium"), 1.0)
        
        return max(1, int(base_time * multiplier))

    def _extract_subject_from_content(self, content: str) -> str:
        """Extract subject area from content."""
        content_lower = content.lower()
        
        if any(term in content_lower for term in ["physics", "mechanics", "force", "velocity", "vector"]):
            return "Physics"
        elif any(term in content_lower for term in ["math", "algebra", "calculus", "equation"]):
            return "Mathematics"
        elif any(term in content_lower for term in ["chemistry", "molecule", "reaction"]):
            return "Chemistry"
        elif any(term in content_lower for term in ["biology", "cell", "organism"]):
            return "Biology"
        else:
            return "General"

    def _analyze_difficulty_distribution(self, questions: List[Dict]) -> Dict:
        """Analyze difficulty distribution of questions."""
        distribution = {"easy": 0, "medium": 0, "hard": 0}
        
        for question in questions:
            difficulty = question.get("difficulty", "medium")
            distribution[difficulty] = distribution.get(difficulty, 0) + 1
        
        total = len(questions)
        if total > 0:
            distribution["percentages"] = {
                level: round(count / total * 100, 1) 
                for level, count in distribution.items() 
                if level != "percentages"
            }
        
        return distribution

    def _create_adaptation_summary(self, student_profile: Dict, questions: List[Dict], strategy: str) -> str:
        """Create summary of how questions were adapted."""
        weak_areas = student_profile.get("weak_areas", [])
        average_score = student_profile.get("average_score", 0.5)
        difficulty_pref = student_profile.get("preferred_difficulty", "medium")
        
        summary_parts = []
        
        if weak_areas:
            weak_focus_count = sum(1 for q in questions if any(weak in q["topic"].lower() for weak in [w.lower() for w in weak_areas]))
            summary_parts.append(f"Targeted {weak_focus_count}/{len(questions)} questions on weak areas: {', '.join(weak_areas[:3])}")
        
        if average_score < 0.4:
            summary_parts.append("Emphasized foundational concepts due to low performance history")
        elif average_score > 0.8:
            summary_parts.append("Included challenging questions to stretch high-performing student")
        
        summary_parts.append(f"Adjusted for {difficulty_pref} difficulty preference")
        
        if strategy:
            summary_parts.append(f"Strategy: {strategy}")
        
        return ". ".join(summary_parts) + "."

    def _generate_recommendations(self, student_profile: Dict, questions: List[Dict]) -> List[str]:
        """Generate recommendations for next steps."""
        recommendations = []
        weak_areas = student_profile.get("weak_areas", [])
        average_score = student_profile.get("average_score", 0.5)
        
        if weak_areas:
            recommendations.append(f"Focus additional practice on: {', '.join(weak_areas[:2])}")
        
        if average_score < 0.5:
            recommendations.append("Review fundamental concepts before attempting harder problems")
        
        topic_coverage = list(set(q["topic"] for q in questions))
        if len(topic_coverage) > 2:
            recommendations.append("Complete questions in topic groups for better understanding")
        
        recommendations.append("Review explanations and hints for incorrect answers")
        
        return recommendations

    def get_tool_start_message(self, tool_input: Dict[str, Any]) -> str:
        """Return a user-friendly message when the tool is called."""
        question_count = len(tool_input.get("questions", []))
        return f"🎯 Processing {question_count} adaptive questions for student..."


# class ConceptMapGenerator(AgentPlugin):
#     name = "concept_map_generator"
#     description = """\
# Generates visual concept maps showing relationships between topics,
# helping students understand knowledge structure and dependencies.
# """
    
#     input_schema = {
#         "type": "object",
#         "properties": {
#             "topics": {"type": "array", "items": {"type": "string"}},
#             "learning_content": {"type": "string"},
#             "student_understanding": {
#                 "type": "object",
#                 "properties": {
#                     "mastered_concepts": {"type": "array", "items": {"type": "string"}},
#                     "struggling_concepts": {"type": "array", "items": {"type": "string"}}
#                 }
#             }
#         },
#         "required": ["topics", "learning_content"]
#     }
    
#     output_schema = {
#         "type": "object",
#         "properties": {
#             "concept_map": {
#                 "type": "object",
#                 "properties": {
#                     "nodes": {
#                         "type": "array",
#                         "items": {
#                             "type": "object",
#                             "properties": {
#                                 "id": {"type": "string"},
#                                 "label": {"type": "string"},
#                                 "category": {"type": "string"},
#                                 "mastery_level": {"type": "string"},
#                                 "importance": {"type": "integer"}
#                             }
#                         }
#                     },
#                     "edges": {
#                         "type": "array",
#                         "items": {
#                             "type": "object",
#                             "properties": {
#                                 "source": {"type": "string"},
#                                 "target": {"type": "string"},
#                                 "relationship": {"type": "string"},
#                                 "strength": {"type": "number"}
#                             }
#                         }
#                     }
#                 }
#             },
#             "learning_priorities": {"type": "array", "items": {"type": "string"}},
#             "prerequisite_gaps": {"type": "array", "items": {"type": "string"}}
#         }
#     }

# class StudyResourceRecommender(AgentPlugin):
#     name = "study_resource_recommender"
#     description = """\
# Recommends personalized study resources (videos, articles, exercises, games)
# based on learning style, weak areas, and current understanding level.
# """
    
#     input_schema = {
#         "type": "object",
#         "properties": {
#             "weak_areas": {"type": "array", "items": {"type": "string"}},
#             "learning_style": {"type": "string"},
#             "difficulty_level": {"type": "string"},
#             "available_time": {"type": "integer"},
#             "preferred_formats": {"type": "array", "items": {"type": "string"}}
#         },
#         "required": ["weak_areas"]
#     }
    
#     output_schema = {
#         "type": "object",
#         "properties": {
#             "recommendations": {
#                 "type": "array",
#                 "items": {
#                     "type": "object",
#                     "properties": {
#                         "title": {"type": "string"},
#                         "type": {"type": "string"},
#                         "url": {"type": "string"},
#                         "duration": {"type": "integer"},
#                         "difficulty": {"type": "string"},
#                         "relevance_score": {"type": "number"},
#                         "topics_covered": {"type": "array", "items": {"type": "string"}},
#                         "description": {"type": "string"}
#                     }
#                 }
#             },
#             "study_schedule": {"type": "string"},
#             "alternative_activities": {"type": "array", "items": {"type": "string"}}
#         }
#     }

# class ProgressTracker(AgentPlugin):
#     name = "progress_tracker"
#     description = """\
# Tracks student learning progress over time, identifies trends,
# and provides insights for both students and educators.
# """
    
#     input_schema = {
#         "type": "object",
#         "properties": {
#             "student_id": {"type": "string"},
#             "time_period": {"type": "string"},
#             "metrics": {"type": "array", "items": {"type": "string"}}
#         },
#         "required": ["student_id"]
#     }
    
#     output_schema = {
#         "type": "object",
#         "properties": {
#             "progress_summary": {
#                 "type": "object",
#                 "properties": {
#                     "overall_improvement": {"type": "number"},
#                     "topic_progress": {"type": "object"},
#                     "learning_velocity": {"type": "number"},
#                     "consistency_score": {"type": "number"},
#                     "achievement_badges": {"type": "array", "items": {"type": "string"}}
#                 }
#             },
#             "trends": {
#                 "type": "array",
#                 "items": {
#                     "type": "object",
#                     "properties": {
#                         "metric": {"type": "string"},
#                         "trend": {"type": "string"},
#                         "significance": {"type": "string"}
#                     }
#                 }
#             },
#             "recommendations": {"type": "array", "items": {"type": "string"}},
#             "next_milestones": {"type": "array", "items": {"type": "string"}}
#         }
#     }
