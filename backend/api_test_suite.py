import requests
import json
import time

BASE_URL = "http://localhost:5000/api"

def run_test(name, func):
    print(f"\n[TEST] {name}...")
    try:
        func()
        print(f"[PASS] {name}")
    except Exception as e:
        print(f"[FAIL] {name}: {e}")

def test_handshake():
    resp = requests.get(f"{BASE_URL}/handshake")
    resp.raise_for_status()
    print("Handshake Response:", resp.json())

def test_syllabus_mode():
    payload = {
        "syllabus": "Module 1: Python Basics\n- Variables\n- Loops\nModule 2: Advanced\n- Classes"
    }
    resp = requests.post(f"{BASE_URL}/journey/syllabus", json=payload)
    resp.raise_for_status()
    data = resp.json()
    print("Syllabus Response Keys:", data.keys())
    # Verify structure
    if "data" in data and "journey" in data["data"]:
         print("Journey Graph Validated")
    else:
         print("Warning: unexpected structure", data)

def test_topic_mode():
    # 1. Start
    payload = {"topic": "Photosynthesis"}
    resp = requests.post(f"{BASE_URL}/journey/topic", json=payload)
    resp.raise_for_status()
    data = resp.json()
    session_id = data.get("session_id")
    print(f"Session Started: {session_id}")
    print(f"Agent Says: {data.get('message')}")
    
    if not session_id:
        raise Exception("No session_id returned")

    # 2. Reply (Simulate interaction)
    payload_reply = {"session_id": session_id, "message": "I know the basics about sunlight."}
    resp = requests.post(f"{BASE_URL}/journey/topic", json=payload_reply)
    resp.raise_for_status()
    data = resp.json()
    print(f"Agent Says (Round 2): {data.get('message')}")
    
    # 3. Force Diagnostic Completion (Simulate 'submit_diagnostic' trigger logic if possible, 
    # or just check if we can continue conversation without crash)
    # Note: We can't easily force the LLM to call the tool in one turn without a strong prompt injection,
    # but we can verify the endpoint doesn't crash.
    payload_finish = {"session_id": session_id, "message": "I am an expert. No more questions needed."}
    resp = requests.post(f"{BASE_URL}/journey/topic", json=payload_finish)
    resp.raise_for_status()
    data = resp.json()
    print(f"Round 3 Status: {data.get('status')}")
    if data.get('data'):
         print("Journey Generated:", data.get('data').keys())

if __name__ == "__main__":
    print("Waiting for server to ensure it is up...")
    time.sleep(3)
    run_test("Handshake", test_handshake)
    run_test("Syllabus Mode", test_syllabus_mode)
    run_test("Topic Mode", test_topic_mode)
