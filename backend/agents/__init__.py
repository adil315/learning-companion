"""
Multi-Agent System for Learning Companion.
Exports all specialized agents for use in Flask orchestration.
"""

from agents.diagnostic_agent import diagnostic_agent
from agents.journey_planner_agent import journey_planner_agent
from agents.lesson_agent import lesson_agent
from agents.quiz_agent import quiz_agent
from agents.srs_agent import srs_agent
from agents.tutor_agent import tutor_agent

__all__ = [
    "diagnostic_agent",
    "journey_planner_agent", 
    "lesson_agent",
    "quiz_agent",
    "srs_agent",
    "tutor_agent",
]

