"""
Test script for DiagnosticAgent

This script demonstrates the DiagnosticAgent functionality
by running a diagnostic test with a sample syllabus.
"""

import sys
import os

# Add parent directory to path to import backend modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.agents.diagnostic_agent import DiagnosticAgent


def test_diagnostic_agent():
    """Test the DiagnosticAgent with a sample syllabus."""
    
    # Sample syllabus
    syllabus = """
    Introduction to Python Programming
    
    Topics covered:
    1. Basic syntax and data types (variables, strings, numbers)
    2. Control structures (if/else, loops)
    3. Functions and modules
    4. Object-oriented programming (classes, inheritance)
    5. File handling and exceptions
    6. Common libraries (requests, pandas, numpy)
    7. Advanced topics (decorators, generators, context managers)
    """
    
    print("=" * 80)
    print("DIAGNOSTIC AGENT TEST")
    print("=" * 80)
    print(f"\nSyllabus:\n{syllabus}\n")
    print("Running diagnostic...\n")
    
    # Initialize agent
    agent = DiagnosticAgent()
    
    # Run diagnostic
    result = agent.run_diagnostic(syllabus)
    
    # Display results
    print("=" * 80)
    print("DIAGNOSTIC RESULTS")
    print("=" * 80)
    print(f"\nExpertise Level: {result.expertise_level.upper()}")
    print(f"\nKnowledge Gaps Identified:")
    for i, gap in enumerate(result.knowledge_gaps, 1):
        print(f"  {i}. {gap}")
    
    # Check session state
    stored_level = agent.get_expertise_level()
    print(f"\nStored in Session State: {stored_level}")
    
    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    test_diagnostic_agent()
