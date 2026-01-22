"""
Test Suite for Multi-Agent Learning Companion Backend.
Tests all API endpoints and pipeline flows.
"""

import requests
import json
import time
from typing import Optional

BASE_URL = "http://localhost:5000/api"


def print_step(msg: str) -> None:
    """Print a formatted step header."""
    print(f"\n{'=' * 60}")
    print(f"  {msg}")
    print(f"{'=' * 60}")


def print_result(success: bool, data: dict | str) -> None:
    """Print formatted result."""
    status = "✓ SUCCESS" if success else "✗ FAILED"
    print(f"\n{status}")
    if isinstance(data, dict):
        print(json.dumps(data, indent=2)[:500])
    else:
        print(str(data)[:500])


# =============================================================================
# TEST: Handshake / Health Check
# =============================================================================

def test_handshake() -> bool:
    """Test the health check endpoint."""
    print_step("Test 1: Handshake / Health Check")
    try:
        resp = requests.get(f"{BASE_URL}/handshake", timeout=10)
        resp.raise_for_status()
        data = resp.json()
        print_result(True, data)
        return data.get("status") == "ok"
    except Exception as e:
        print_result(False, str(e))
        return False


# =============================================================================
# TEST: Pipeline A - Syllabus Mode
# =============================================================================

def test_syllabus_mode() -> bool:
    """Test syllabus mode journey generation."""
    print_step("Test 2: Pipeline A - Syllabus Mode")
    
    # User-provided test syllabus
    syllabus_text = """
Module 1
Basic Concepts of Data Structures
Definitions; Data Abstraction; Performance Analysis - Time & Space
Complexity, Asymptotic Notations; Polynomial representation using Arrays,
Sparse matrix (Tuple representation); Stacks and Queues - Stacks, Multi-
Stacks, Queues, Circular Queues, Double Ended Queues; Evaluation of
Expressions- Infix to Postfix, Evaluating Postfix Expressions.

Module 2
Linked List and Memory Management
Singly Linked List - Operations on Linked List, Stacks and Queues using
Linked List, Polynomial representation using Linked List; Doubly Linked List;
Circular Linked List; Memory allocation - First-fit, Best-fit, and Worst-fit
allocation schemes; Garbage collection and compaction.
"""
    
    try:
        print("Sending syllabus to /api/journey/syllabus...")
        resp = requests.post(
            f"{BASE_URL}/journey/syllabus",
            json={"text": syllabus_text},
            timeout=60
        )
        resp.raise_for_status()
        data = resp.json()
        
        # Validate response structure
        has_nodes = "nodes" in data
        has_journey_id = "journey_id" in data
        
        print_result(has_nodes and has_journey_id, data)
        
        if has_nodes:
            print(f"\nGenerated {len(data['nodes'])} nodes:")
            for node in data.get('nodes', [])[:3]:
                print(f"  - {node.get('title', 'Unknown')}")
        
        return has_nodes
    except Exception as e:
        print_result(False, str(e))
        return False


# =============================================================================
# TEST: Pipeline B - Topic Mode (Diagnostic -> Planner)
# =============================================================================

def test_topic_mode() -> bool:
    """Test topic mode with diagnostic conversation and handoff."""
    print_step("Test 3: Pipeline B - Topic Mode (Diagnostic Chat)")
    
    session_id: Optional[str] = None
    
    try:
        # Step 1: Start diagnostic session
        print("1. Starting diagnostic session for 'Python Lists'...")
        resp = requests.post(
            f"{BASE_URL}/journey/topic/chat",
            json={"topic": "Python Lists"},
            timeout=60
        )
        resp.raise_for_status()
        data = resp.json()
        
        session_id = data.get("sessionId")
        print(f"   Session ID: {session_id}")
        print(f"   Agent: {data.get('message', '')[:100]}...")
        
        if not session_id:
            print_result(False, "No session ID received")
            return False
        
        # Step 2: Simulate conversation
        responses = [
            "I know how to create lists and access elements by index.",
            "I'm familiar with list methods like append, extend, and pop.",
            "I can use list comprehensions and understand slicing."
        ]
        
        for i, msg in enumerate(responses, 2):
            print(f"\n{i}. User: {msg}")
            time.sleep(1)  # Rate limiting
            
            resp = requests.post(
                f"{BASE_URL}/journey/topic/chat",
                json={"sessionId": session_id, "message": msg},
                timeout=60
            )
            resp.raise_for_status()
            data = resp.json()
            
            status = data.get("status")
            print(f"   Status: {status}")
            
            if status == "complete":
                print(f"   Level: {data.get('level')}")
                journey = data.get("journey", {})
                if "nodes" in journey:
                    print(f"   Journey generated with {len(journey['nodes'])} nodes!")
                    print_result(True, {"level": data.get("level"), "nodes_count": len(journey["nodes"])})
                    return True
            else:
                print(f"   Agent: {data.get('message', '')[:80]}...")
        
        print_result(False, "Diagnostic did not complete within expected turns")
        return False
        
    except Exception as e:
        print_result(False, str(e))
        return False


# =============================================================================
# TEST: Lesson Generation
# =============================================================================

def test_lesson_generation() -> bool:
    """Test lesson content generation."""
    print_step("Test 4: Lesson Generation")
    
    try:
        print("Generating lesson for 'Python List Comprehensions'...")
        resp = requests.post(
            f"{BASE_URL}/lesson/generate",
            json={
                "title": "Python List Comprehensions",
                "user_level": "Intermediate"
            },
            timeout=60
        )
        resp.raise_for_status()
        data = resp.json()
        
        has_content = "content" in data and len(data["content"]) > 100
        print_result(has_content, {
            "title": data.get("title"),
            "level": data.get("level"),
            "content_length": len(data.get("content", ""))
        })
        
        if has_content:
            print(f"\nContent preview:\n{data['content'][:300]}...")
        
        return has_content
    except Exception as e:
        print_result(False, str(e))
        return False


# =============================================================================
# TEST: Quiz/Code Submission
# =============================================================================

def test_code_submission() -> bool:
    """Test code submission and evaluation."""
    print_step("Test 5: Code Submission")
    
    code = """
# Sum of a list
numbers = [1, 2, 3, 4, 5]
total = sum(numbers)
print(f"Sum: {total}")
"""
    
    try:
        print("Submitting Python code for evaluation...")
        resp = requests.post(
            f"{BASE_URL}/module/submit",
            json={
                "type": "code",
                "language": "python",
                "content": code,
                "question": "Write code to calculate the sum of a list"
            },
            timeout=60
        )
        resp.raise_for_status()
        data = resp.json()
        
        print_result(True, data)
        return True
    except Exception as e:
        print_result(False, str(e))
        return False


def test_quiz_submission() -> bool:
    """Test quiz answer submission."""
    print_step("Test 6: Quiz Submission")
    
    try:
        print("Submitting quiz answer...")
        resp = requests.post(
            f"{BASE_URL}/module/submit",
            json={
                "type": "quiz",
                "question": "What is the time complexity of list.pop(0) in Python?",
                "content": "It is O(n) because all elements need to be shifted."
            },
            timeout=60
        )
        resp.raise_for_status()
        data = resp.json()
        
        print_result(True, data)
        return True
    except Exception as e:
        print_result(False, str(e))
        return False


# =============================================================================
# TEST: SRS Actions
# =============================================================================

def test_srs_actions() -> bool:
    """Test SRS flashcard operations."""
    print_step("Test 7: SRS Flashcard Actions")
    
    try:
        # Create a flashcard
        print("Creating flashcard...")
        resp = requests.post(
            f"{BASE_URL}/srs/action",
            json={
                "action": "create",
                "front": "What is a Python list?",
                "back": "An ordered, mutable collection of items."
            },
            timeout=30
        )
        resp.raise_for_status()
        create_data = resp.json()
        print(f"   Create result: {create_data}")
        
        # Get due cards
        print("Getting due cards...")
        resp = requests.post(
            f"{BASE_URL}/srs/action",
            json={"action": "review"},
            timeout=30
        )
        resp.raise_for_status()
        review_data = resp.json()
        print(f"   Review result: {review_data}")
        
        print_result(True, {"create": create_data, "review": review_data})
        return True
    except Exception as e:
        print_result(False, str(e))
        return False


# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

def main():
    """Run all tests and report results."""
    print("\n" + "=" * 60)
    print("  MULTI-AGENT LEARNING COMPANION - TEST SUITE")
    print("=" * 60)
    print(f"Target: {BASE_URL}")
    print("=" * 60)
    
    results = {
        "Handshake": test_handshake(),
        "Syllabus Mode": test_syllabus_mode(),
        "Topic Mode": test_topic_mode(),
        "Lesson Generation": test_lesson_generation(),
        "Code Submission": test_code_submission(),
        "Quiz Submission": test_quiz_submission(),
        "SRS Actions": test_srs_actions(),
    }
    
    # Summary
    print("\n" + "=" * 60)
    print("  TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for name, success in results.items():
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"  {status}  {name}")
    
    print("-" * 60)
    print(f"  {passed}/{total} tests passed")
    print("=" * 60)
    
    return passed == total


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
