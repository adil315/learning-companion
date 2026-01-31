"""
Flask Application - Multi-Agent Orchestrator with Async Job Queue.
Coordinates the 5 specialized agents via API endpoints for both pipeline modes.
Implements background job processing for long-running LLM requests.

Performance optimizations:
- TTL caching for frequently accessed data
- Rate limiting to prevent overload
- Increased worker pool for concurrent requests
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.adk.runners import InMemoryRunner
from google.genai import types
import uuid
import os
import json
import re
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Dict, Any, Optional

# Performance imports
from cachetools import TTLCache
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Import agents from the agents module
from agents.diagnostic_agent import diagnostic_agent
from agents.journey_planner_agent import journey_planner_agent
from agents.lesson_agent import lesson_agent
from agents.quiz_agent import quiz_agent
from agents.srs_agent import srs_agent
from agents.tutor_agent import tutor_agent

# Import db functions for user management
from db import (
    create_user, get_user, update_user_xp, get_user_journeys, save_user_journey, 
    save_lesson, get_lesson, get_db, BADGE_DEFINITIONS, 
    save_tutor_message, get_tutor_history, clear_tutor_history, 
    save_flashcard, get_due_flashcards, update_flashcard_schedule, get_flashcard_stats,
    # Subscription & token limit functions
    check_generation_limit, use_generation, upgrade_to_pro, cancel_subscription as db_cancel_subscription,
    get_user_usage, FREE_TIER_DAILY_LIMIT
)
from bson import ObjectId

# PayPal integration
import paypal

# Firebase Admin for token verification
from firebase_admin import auth as firebase_auth

app = Flask(__name__)
# CORS configuration
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
CORS(app, resources={
    r"/api/*": {
        "origins": [frontend_url, "http://localhost:3000", "http://127.0.0.1:3000"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Health Check & Root Routes (Critical for Render)
@app.route("/", methods=["GET"])
def root():
    return jsonify({"status": "ok", "message": "Backend Running"}), 200


# =============================================================================
# PERFORMANCE CONFIGURATION
# =============================================================================

# Rate limiter - prevents API abuse
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
)

# Caches with TTL (time-to-live in seconds)
user_cache = TTLCache(maxsize=1000, ttl=300)  # 5 minutes
badge_cache = TTLCache(maxsize=10, ttl=3600)  # 1 hour
lesson_cache = TTLCache(maxsize=500, ttl=1800)  # 30 minutes

# Thread pool for background jobs (increased from 4 to 8)
executor = ThreadPoolExecutor(max_workers=8)

# In-memory storage for active diagnostic sessions
# Format: { session_id: { "runner": InMemoryRunner, "adk_session_id": str, "topic": str } }
active_sessions: Dict[str, Dict[str, Any]] = {}

# In-memory storage for active tutor sessions (per user)
# Format: { user_id: { "runner": InMemoryRunner, "adk_session_id": str } }
tutor_sessions: Dict[str, Dict[str, Any]] = {}

# Job queue for async operations
# Format: { job_id: { "status": str, "result": Any, "error": str, "created_at": str, "completed_at": str } }
job_queue: Dict[str, Dict[str, Any]] = {}

# =============================================================================
# BACKGROUND EVENT LOOP FOR ASYNC OPERATIONS
# =============================================================================
# We use a dedicated thread with its own event loop to avoid "Event loop is closed" errors
# This loop persists for the lifetime of the application

_background_loop = None
_background_thread = None

def _start_background_loop(loop):
    """Run the event loop in a background thread."""
    asyncio.set_event_loop(loop)
    loop.run_forever()

def get_or_create_event_loop():
    """Get the background event loop, creating it if necessary."""
    global _background_loop, _background_thread
    
    if _background_loop is None or _background_loop.is_closed():
        _background_loop = asyncio.new_event_loop()
        _background_thread = threading.Thread(target=_start_background_loop, args=(_background_loop,), daemon=True)
        _background_thread.start()
    
    return _background_loop

def run_async(coro):
    """Run an async coroutine in the background event loop and wait for its result."""
    loop = get_or_create_event_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result(timeout=120)  # 2 minute timeout

# Initialize the background loop on module load
import threading
get_or_create_event_loop()
print("[DEBUG] Background event loop initialized")


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def create_user_message(text: str) -> types.Content:
    """Create a proper ADK user message Content object."""
    return types.Content(
        role="user",
        parts=[types.Part(text=text)]
    )


def clean_and_parse_json(text: str) -> dict | None:
    """Extract and parse JSON from LLM output, handling various formats."""
    if not text:
        return None
    print(f"[DEBUG] Raw LLM Output: {text[:500]}...")
    try:
        # 1. Try direct JSON parse (cleanest case)
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass
    
    try:
        # 2. Try extracting JSON from markdown code blocks
        code_block_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if code_block_match:
            return json.loads(code_block_match.group(1))
        
        # 3. Try extracting the first JSON object
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            return json.loads(json_match.group(0))
    except json.JSONDecodeError as e:
        print(f"[ERROR] JSON Parse Failed: {e}")
    
    return None


async def run_agent_async(runner: InMemoryRunner, user_id: str, session_id: str, message: str) -> str:
    """Run an agent asynchronously and collect all response text including tool outputs."""
    full_text = ""
    
    user_content = create_user_message(message)
    
    try:
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session_id,
            new_message=user_content
        ):
            # Debug log the event type
            event_type = type(event).__name__
            
            # Extract text from event content
            if hasattr(event, 'content') and event.content:
                if hasattr(event.content, 'parts'):
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            full_text += part.text
                        # Capture function response (tool output)
                        if hasattr(part, 'function_response') and part.function_response:
                            func_resp = part.function_response
                            if hasattr(func_resp, 'response') and func_resp.response:
                                # Try to get the result from the response
                                resp = func_resp.response
                                if isinstance(resp, dict):
                                    result = resp.get('result', '')
                                    if result:
                                        full_text += f" {result}"
                                        print(f"[DEBUG] Tool output captured: {result}")
                                elif isinstance(resp, str):
                                    full_text += f" {resp}"
                                    print(f"[DEBUG] Tool output (str): {resp}")
            # Also check for direct text attribute
            elif hasattr(event, 'text') and event.text:
                full_text += event.text
                
    except Exception as e:
        print(f"[ERROR] run_agent_async failed: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"[DEBUG] Full agent response: {full_text[:300]}...")
    return full_text


async def create_session_async(runner: InMemoryRunner, app_name: str, user_id: str) -> str:
    """Create a session and return the session ID."""
    session = await runner.session_service.create_session(
        app_name=app_name,
        user_id=user_id
    )
    return session.id


def run_agent_sync(runner: InMemoryRunner, user_id: str, message: str, app_name: str = "learning_companion") -> str:
    """Synchronous wrapper to run agent. Works in both main thread and background threads."""
    async def _run():
        # Create session first
        session_id = await create_session_async(runner, app_name, user_id)
        print(f"[DEBUG] Created session: {session_id}")
        
        # Run the agent
        result = await run_agent_async(runner, user_id, session_id, message)
        return result
    
    # Try to get existing event loop, create new one if none exists (for background threads)
    try:
        loop = asyncio.get_running_loop()
        # If we're in a running loop, we need to use run_coroutine_threadsafe
        # But since we're likely in a sync context, this shouldn't happen
        return asyncio.run(_run())
    except RuntimeError:
        # No running loop - create a new one (this is the background thread case)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(_run())
        finally:
            loop.close()


# =============================================================================
# JOB QUEUE MANAGEMENT
# =============================================================================

def create_job() -> str:
    """Create a new job and return its ID."""
    job_id = str(uuid.uuid4())
    job_queue[job_id] = {
        "status": "pending",
        "result": None,
        "error": None,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None
    }
    return job_id


def complete_job(job_id: str, result: Any, error: Optional[str] = None):
    """Mark a job as complete with its result or error."""
    if job_id in job_queue:
        job_queue[job_id]["status"] = "failed" if error else "completed"
        job_queue[job_id]["result"] = result
        job_queue[job_id]["error"] = error
        job_queue[job_id]["completed_at"] = datetime.utcnow().isoformat()


def process_syllabus_job(job_id: str, syllabus_text: str):
    """Background worker to process syllabus and generate journey map."""
    print(f"[Job {job_id}] Starting syllabus processing...")
    
    try:
        runner = InMemoryRunner(agent=journey_planner_agent, app_name="syllabus_app")
        prompt = f"Mode: SYLLABUS. Input Text:\n\n{syllabus_text}"
        
        text_response = run_agent_sync(runner, "syllabus_user", prompt, "syllabus_app")
        journey_data = clean_and_parse_json(text_response)
        
        if not journey_data:
            complete_job(job_id, None, f"Failed to parse JSON. Raw: {text_response[:300]}")
            return
        
        # Add journey_id if not present
        if 'journey_id' not in journey_data:
            journey_data['journey_id'] = str(uuid.uuid4())
        
        print(f"[Job {job_id}] Completed successfully!")
        complete_job(job_id, journey_data)
    except Exception as e:
        print(f"[Job {job_id}] Failed: {e}")
        import traceback
        traceback.print_exc()
        complete_job(job_id, None, str(e))


def process_topic_planner_job(job_id: str, topic: str, mastery_level: str):
    """Background worker to process topic and generate adaptive journey map."""
    print(f"[Job {job_id}] Starting topic planning for {topic} (Level: {mastery_level})...")
    
    try:
        planner_runner = InMemoryRunner(agent=journey_planner_agent, app_name="planner_app")
        plan_prompt = f"Mode: TOPIC. Topic: {topic}. User Level: {mastery_level}."
        
        plan_text = run_agent_sync(planner_runner, "planner_user", plan_prompt, "planner_app")
        journey_data = clean_and_parse_json(plan_text)
        
        if not journey_data:
            complete_job(job_id, None, f"Failed to parse JSON. Raw: {plan_text[:300]}")
            return
        
        if 'journey_id' not in journey_data:
            journey_data['journey_id'] = str(uuid.uuid4())
        
        print(f"[Job {job_id}] Completed successfully!")
        complete_job(job_id, journey_data)
    except Exception as e:
        print(f"[Job {job_id}] Failed: {e}")
        import traceback
        traceback.print_exc()
        complete_job(job_id, None, str(e))


# =============================================================================
# JOB STATUS ENDPOINT
# =============================================================================

@app.route('/api/job/<job_id>', methods=['GET'])
def get_job_status(job_id: str):
    """
    Get the status of a background job.
    
    Returns:
        - status: 'pending', 'completed', or 'failed'
        - result: The job result (if completed)
        - error: Error message (if failed)
    """
    if job_id not in job_queue:
        return jsonify({"error": "Job not found"}), 404
    
    job = job_queue[job_id]
    response = {
        "job_id": job_id,
        "status": job["status"],
        "created_at": job["created_at"],
        "completed_at": job["completed_at"]
    }
    
    if job["status"] == "completed":
        response["result"] = job["result"]
    elif job["status"] == "failed":
        response["error"] = job["error"]
    
    return jsonify(response)


# =============================================================================
# USER AUTHENTICATION & MANAGEMENT API
# =============================================================================

def verify_firebase_token(request):
    """Verify Firebase ID token from Authorization header."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None, "Missing or invalid Authorization header"
    
    token = auth_header.split('Bearer ')[1]
    
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token, None
    except Exception as e:
        print(f"[AUTH] Token verification failed: {e}")
        return None, str(e)


@app.route('/api/user/profile', methods=['GET'])
def get_user_profile():
    """Get current user's profile data."""
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    user_data = get_user(user_id)
    
    if user_data:
        return jsonify(user_data)
    else:
        return jsonify({"error": "User not found"}), 404


@app.route('/api/user/create', methods=['POST'])
def create_user_profile():
    """Create a new user profile."""
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    
    user_data = create_user(
        user_id=user_id,
        display_name=data.get('displayName', 'Learner'),
        email=data.get('email', ''),
        photo_url=data.get('photoURL')
    )
    
    return jsonify(user_data)


@app.route('/api/user/journeys', methods=['GET'])
def get_journeys():
    """Get all journeys for the current user."""
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    journeys = get_user_journeys(user_id)
    
    return jsonify({"journeys": journeys})


@app.route('/api/user/journeys', methods=['POST'])
def save_journey():
    """Save a journey for the current user."""
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    journey_data = request.json
    
    journey_id = save_user_journey(user_id, journey_data)
    
    return jsonify({"journey_id": journey_id, "success": True})


@app.route('/api/user/xp', methods=['POST'])
def award_xp():
    """Award XP to the current user."""
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    xp_amount = data.get('xp', 0)
    
    result = update_user_xp(user_id, xp_amount)
    
    return jsonify(result)


@app.route('/api/badges', methods=['GET'])
def get_badges():
    """Get all badge definitions."""
    return jsonify({"badges": BADGE_DEFINITIONS})


# =============================================================================
# SUBSCRIPTION & PAYMENT API
# =============================================================================

@app.route('/api/user/usage', methods=['GET'])
def get_usage():
    """Get user's usage statistics and subscription status."""
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    usage = get_user_usage(user_id)
    
    return jsonify(usage)


@app.route('/api/subscription/pricing', methods=['GET'])
def get_pricing():
    """Get subscription pricing information."""
    pricing = paypal.get_pricing_info()
    return jsonify(pricing)


@app.route('/api/subscription/create', methods=['POST'])
def create_subscription():
    """
    Create a PayPal subscription for the user.
    
    Request Body:
        - plan_type: 'monthly' or 'yearly'
        
    Returns:
        - approval_url: URL to redirect user to PayPal
        - subscription_id: PayPal subscription ID
    """
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    plan_type = data.get('plan_type', 'monthly')
    
    # Get or create PayPal product and plan
    # In production, these would be stored/cached
    product_id = paypal.create_product()
    if not product_id:
        return jsonify({"error": "Failed to create PayPal product"}), 500
    
    plan_id = paypal.create_subscription_plan(product_id, plan_type)
    if not plan_id:
        return jsonify({"error": "Failed to create PayPal plan"}), 500
    
    # Create subscription with return URLs
    base_url = request.host_url.rstrip('/')
    frontend_url = "http://localhost:3000"  # In production, use actual frontend URL
    
    result = paypal.create_subscription(
        plan_id=plan_id,
        return_url=f"{frontend_url}/pricing/success?user_id={user_id}&plan_type={plan_type}",
        cancel_url=f"{frontend_url}/pricing?cancelled=true"
    )
    
    if "error" in result:
        return jsonify({"error": result["error"]}), 500
    
    return jsonify({
        "approval_url": result.get("approval_url"),
        "subscription_id": result.get("subscription_id"),
        "status": result.get("status")
    })


@app.route('/api/subscription/activate', methods=['POST'])
def activate_subscription():
    """
    Activate a subscription after PayPal approval.
    
    Request Body:
        - subscription_id: PayPal subscription ID
        - plan_type: 'monthly' or 'yearly'
    """
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    subscription_id = data.get('subscription_id')
    plan_type = data.get('plan_type', 'monthly')
    
    if not subscription_id:
        return jsonify({"error": "subscription_id required"}), 400
    
    # Verify subscription status with PayPal
    sub_details = paypal.get_subscription_details(subscription_id)
    
    if not sub_details:
        return jsonify({"error": "Failed to verify subscription"}), 500
    
    if sub_details.get("status") != "ACTIVE":
        return jsonify({
            "error": f"Subscription is not active. Status: {sub_details.get('status')}"
        }), 400
    
    # Upgrade user in database
    success = upgrade_to_pro(user_id, subscription_id, plan_type)
    
    if success:
        return jsonify({
            "success": True,
            "tier": "pro",
            "message": "Successfully upgraded to Pro!"
        })
    else:
        return jsonify({"error": "Failed to activate subscription"}), 500


@app.route('/api/subscription/cancel', methods=['POST'])
def cancel_user_subscription():
    """Cancel the current user's subscription."""
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    user = get_user(user_id)
    
    if not user or user.get("tier") != "pro":
        return jsonify({"error": "No active subscription"}), 400
    
    subscription_id = user.get("subscription_id")
    
    if subscription_id:
        # Cancel with PayPal
        paypal.cancel_subscription(subscription_id)
    
    # Update database
    success = db_cancel_subscription(user_id)
    
    if success:
        return jsonify({
            "success": True,
            "message": "Subscription cancelled. You have access until the end of your billing period."
        })
    else:
        return jsonify({"error": "Failed to cancel subscription"}), 500


@app.route('/api/subscription/webhook', methods=['POST'])
def paypal_webhook():
    """
    Handle PayPal webhook notifications.
    
    Events handled:
    - BILLING.SUBSCRIPTION.ACTIVATED
    - BILLING.SUBSCRIPTION.CANCELLED
    - BILLING.SUBSCRIPTION.EXPIRED
    - PAYMENT.SALE.COMPLETED
    """
    # Note: In production, verify webhook signature
    try:
        event = request.json
        event_type = event.get("event_type", "")
        resource = event.get("resource", {})
        
        print(f"[PayPal Webhook] Received: {event_type}")
        
        if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
            subscription_id = resource.get("id")
            # User upgrade is handled in /activate endpoint
            print(f"[PayPal] Subscription activated: {subscription_id}")
            
        elif event_type in ["BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED"]:
            subscription_id = resource.get("id")
            # Find and downgrade user
            # In production, you'd query by subscription_id
            print(f"[PayPal] Subscription ended: {subscription_id}")
            
        elif event_type == "PAYMENT.SALE.COMPLETED":
            print(f"[PayPal] Payment received")
        
        return jsonify({"status": "ok"}), 200
        
    except Exception as e:
        print(f"[PayPal Webhook] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/user/progress', methods=['POST'])
def save_progress():
    """Save module progress for the current user."""
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    journey_id = data.get('journey_id', '')
    node_id = data.get('node_id', '')
    completed_steps = data.get('completed_steps', [])
    current_step_index = data.get('current_step_index', 0)
    
    if not journey_id or not node_id:
        return jsonify({"error": "journey_id and node_id required"}), 400
    
    try:
        db = get_firestore_client()
        
        # Save to progress subcollection
        progress_ref = db.collection('users').document(user_id).collection('progress').document(f"{journey_id}_{node_id}")
        progress_ref.set({
            'journey_id': journey_id,
            'node_id': node_id,
            'completed_steps': completed_steps,
            'current_step_index': current_step_index,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        # Also update nodeProgress in the journey document for dashboard display
        journey_ref = db.collection('users').document(user_id).collection('journeys').document(journey_id)
        journey_doc = journey_ref.get()
        
        if journey_doc.exists:
            journey_data = journey_doc.to_dict()
            node_progress = journey_data.get('nodeProgress', {})
            node_progress[node_id] = {
                'completedSteps': len(completed_steps),
                'currentStepIndex': current_step_index
            }
            journey_ref.update({
                'nodeProgress': node_progress,
                'updatedAt': datetime.utcnow()
            })
        
        print(f"[Progress] Saved progress for user {user_id}: {node_id}, steps: {len(completed_steps)}")
        return jsonify({"success": True})
    except Exception as e:
        print(f"[ERROR] Failed to save progress: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/user/progress/<journey_id>/<node_id>', methods=['GET'])
def get_progress(journey_id, node_id):
    """Get module progress for the current user."""
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    
    try:
        db = get_firestore_client()
        progress_ref = db.collection('users').document(user_id).collection('progress').document(f"{journey_id}_{node_id}")
        doc = progress_ref.get()
        
        if doc.exists:
            return jsonify(doc.to_dict())
        else:
            return jsonify({
                'journey_id': journey_id,
                'node_id': node_id,
                'completed_steps': [],
                'current_step_index': 0
            })
    except Exception as e:
        print(f"[ERROR] Failed to get progress: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/journey/<journey_id>/complete-node', methods=['POST'])
def complete_journey_node(journey_id):
    """
    Mark a node as completed in the journey's completedNodes array.
    This updates the dashboard progress display.
    """
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    node_id = data.get('node_id', '')
    
    if not node_id:
        return jsonify({"error": "node_id required"}), 400
    
    try:
        db = get_firestore_client()
        
        # Find the journey document in user's journeys subcollection
        journey_ref = db.collection('users').document(user_id).collection('journeys').document(journey_id)
        journey_doc = journey_ref.get()
        
        if not journey_doc.exists:
            return jsonify({"error": "Journey not found"}), 404
        
        journey_data = journey_doc.to_dict()
        completed_nodes = journey_data.get('completedNodes', [])
        
        # Add node to completedNodes if not already present
        if node_id not in completed_nodes:
            completed_nodes.append(node_id)
            journey_ref.update({
                'completedNodes': completed_nodes,
                'updatedAt': datetime.utcnow()
            })
            print(f"[Journey] Marked node {node_id} as completed in journey {journey_id}")
        
        return jsonify({
            "success": True,
            "completedNodes": completed_nodes
        })
        
    except Exception as e:
        print(f"[ERROR] Failed to complete node: {e}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# PIPELINE A: SYLLABUS MODE (Direct Pipeline with Async Option)
# =============================================================================

@app.route('/api/journey/syllabus', methods=['POST'])
def create_syllabus_journey():
    """
    Pipeline A: Syllabus Mode - Direct parsing of syllabus to journey map.
    
    Request Body:
        - text (str): Raw syllabus text to parse
        - async (bool, optional): If true, returns job_id for polling (default: false)
        
    Returns:
        If async=false: JourneyMapGraph JSON directly
        If async=true: { job_id, status: "pending" } for polling
    """
    # Support both JSON and raw text input
    if request.is_json:
        syllabus_text = request.json.get('text', '')
        use_async = request.json.get('async', False)
    else:
        syllabus_text = request.data.decode('utf-8')
        use_async = False
        
    # Verify auth and check limits
    decoded_token, error = verify_firebase_token(request)
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    
    # Check generation limits
    limit_status = check_generation_limit(user_id)
    if not limit_status['allowed']:
        return jsonify({
            "error": "Daily generation limit reached",
            "limit_exceeded": True,
            "tier": limit_status['tier'], 
            "reset_time": limit_status.get('reset_time')
        }), 403
    
    if not syllabus_text.strip():
        return jsonify({"error": "No syllabus text provided"}), 400
    
    print(f"[Syllabus Mode] Processing syllabus ({len(syllabus_text)} chars), async={use_async}")
    
    # Consume generation
    use_generation(user_id)
    
    if use_async:
        # Async mode: Create job and process in background
        job_id = create_job()
        executor.submit(process_syllabus_job, job_id, syllabus_text)
        
        return jsonify({
            "job_id": job_id,
            "status": "pending",
            "message": "Processing syllabus in background. Poll /api/job/{job_id} for status."
        })
    
    # Sync mode: Process immediately (may timeout for long inputs)
    try:
        runner = InMemoryRunner(agent=journey_planner_agent, app_name="syllabus_app")
        prompt = f"Mode: SYLLABUS. Input Text:\n\n{syllabus_text}"
        
        text_response = run_agent_sync(runner, "syllabus_user", prompt, "syllabus_app")
        journey_data = clean_and_parse_json(text_response)
        
        if not journey_data:
            return jsonify({
                "error": "Failed to generate journey map",
                "raw_response": text_response[:500] if text_response else "No response"
            }), 500
        
        # Add journey_id if not present
        if 'journey_id' not in journey_data:
            journey_data['journey_id'] = str(uuid.uuid4())
        
        return jsonify(journey_data)
    except Exception as e:
        print(f"[ERROR] Syllabus mode failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# PIPELINE B: TOPIC MODE (Sequential Diagnostic -> Planner)
# =============================================================================

@app.route('/api/journey/topic/chat', methods=['POST'])
def diagnostic_chat():
    """
    Pipeline B: Topic Mode - Multi-turn diagnostic followed by journey planning.
    
    Request Body:
        - session_id (str, optional): Session ID for continuing conversation
        - answer (str, optional): User's response in the diagnostic
        - topic (str): Topic to learn (required for new sessions)
        - skip (bool, optional): Skip the diagnostic and use beginner level
        
    Returns:
        - status: 'chatting' (mid-conversation), 'complete', or 'processing' (async planning)
        - message: Agent's response
        - session_id: Session ID for continuing the conversation
        - journey: JourneyMapGraph (only when complete)
        - job_id: Job ID for polling (only when status='processing')
    """
    data = request.json
    
    # Verify auth (required for limits)
    decoded_token, error = verify_firebase_token(request)
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    
    # Support both sessionId and session_id for backwards compatibility
    session_id = data.get('session_id') or data.get('sessionId')
    # Support both answer and message for backwards compatibility
    user_input = data.get('answer') or data.get('message', '')
    topic = data.get('topic', '')
    skip_assessment = data.get('skip', False)
    
    # Handle skip assessment request
    if skip_assessment:
        # Check generation limits before creating journey
        limit_status = check_generation_limit(user_id)
        if not limit_status['allowed']:
            return jsonify({
                "error": "Daily generation limit reached",
                "limit_exceeded": True
            }), 403
            
        use_generation(user_id)
        
        # Skip works for both existing sessions and new requests
        if session_id and session_id in active_sessions:
            session_data = active_sessions[session_id]
            topic = session_data["topic"]
            del active_sessions[session_id]
        
        # Must have a topic to skip
        if not topic:
            return jsonify({"error": "Topic is required to skip assessment"}), 400
        
        print(f"[Topic Mode] Skipping diagnostic for topic: {topic}, creating journey directly...")
        
        # Start journey generation with beginner level
        job_id = create_job()
        executor.submit(process_topic_planner_job, job_id, topic, "Beginner")
        
        return jsonify({
            "session_id": session_id or str(uuid.uuid4()),
            "status": "processing",
            "level": "Beginner",
            "job_id": job_id,
            "message": "Skipping assessment. Generating journey for beginners..."
        })
    
    try:
        # -------------------------------------------------------------------------
        # STEP 1: Initialize or Retrieve Session
        # -------------------------------------------------------------------------
        if not session_id or session_id not in active_sessions:
            # New session - create diagnostic runner
            session_id = str(uuid.uuid4())
            runner = InMemoryRunner(agent=diagnostic_agent, app_name="diagnostic_app")
            
            # Use the persistent background event loop
            adk_session_id = run_async(
                create_session_async(runner, "diagnostic_app", session_id)
            )
            
            active_sessions[session_id] = {
                "runner": runner,
                "adk_session_id": adk_session_id,
                "topic": topic
            }
            
            print(f"[Topic Mode] New session {session_id} (ADK: {adk_session_id}) for topic: {topic}")
            
            # Start the diagnostic conversation
            initial_prompt = f"I want to learn about {topic}. Please assess my current knowledge level."
            
            response_text = run_async(
                run_agent_async(runner, session_id, adk_session_id, initial_prompt)
            )
        else:
            # Existing session - continue conversation
            session_data = active_sessions[session_id]
            runner = session_data["runner"]
            adk_session_id = session_data["adk_session_id"]
            topic = session_data["topic"]
            
            print(f"[Topic Mode] Continuing session {session_id}, user said: {user_input[:50] if user_input else 'empty'}...")
            
            # Include topic context in the user message to help agent stay on topic
            contextual_input = f"[Topic: {topic}] User's answer: {user_input}"
            
            try:
                response_text = run_async(
                    run_agent_async(runner, session_id, adk_session_id, contextual_input)
                )
            except Exception as e:
                print(f"[ERROR] Session continuation failed: {e}")
                # Session may have become invalid, clean it up
                if session_id in active_sessions:
                    del active_sessions[session_id]
                return jsonify({
                    "error": "Session expired. Please start again.",
                    "status": "error",
                    "session_expired": True
                }), 400
        
        # -------------------------------------------------------------------------
        # STEP 2: Check for Diagnostic Completion Signal
        # -------------------------------------------------------------------------
        # Check for multiple completion patterns:
        # 1. DIAGNOSTIC_COMPLETE:Level (explicit signal)
        # 2. submit_diagnostic(mastery_level="Level") (tool call as text)
        
        is_complete = False
        mastery_level = "Beginner"  # Default
        
        # Pattern 1: DIAGNOSTIC_COMPLETE:Level
        if "DIAGNOSTIC_COMPLETE" in response_text:
            is_complete = True
            parts = response_text.split("DIAGNOSTIC_COMPLETE:")
            if len(parts) > 1:
                level_part = parts[1].strip().split()[0] if parts[1].strip() else "Beginner"
                mastery_level = level_part.strip('",.')
        
        # Pattern 2: submit_diagnostic(mastery_level="Level")
        import re
        submit_match = re.search(r'submit_diagnostic\s*\(\s*mastery_level\s*=\s*["\']?(\w+)["\']?\s*\)', response_text, re.IGNORECASE)
        if submit_match:
            is_complete = True
            mastery_level = submit_match.group(1).capitalize()
            print(f"[Topic Mode] Detected submit_diagnostic call with level: {mastery_level}")
        
        # If diagnostic is complete, start journey creation
        if is_complete:
            print(f"[Topic Mode] Diagnostic complete! Level: {mastery_level}")
            
            # Clean up diagnostic session
            del active_sessions[session_id]
            
            # ---------------------------------------------------------------------
            # STEP 3: HANDOFF to Journey Planner (ASYNC)
            # ---------------------------------------------------------------------
            
            # Check generation limits before creating journey
            limit_status = check_generation_limit(user_id)
            if not limit_status['allowed']:
                # Even if diagnostic is done, we can't generate the full journey
                # Return partial success or error? Error is safer to prevent free usage
                return jsonify({
                    "error": "Daily generation limit reached. Upgrade to Pro to complete your journey.",
                    "limit_exceeded": True
                }), 403
                
            use_generation(user_id)
            
            job_id = create_job()
            executor.submit(process_topic_planner_job, job_id, topic, mastery_level)
            
            return jsonify({
                "session_id": session_id,
                "status": "processing",
                "level": mastery_level,
                "job_id": job_id,
                "message": f"Diagnostic complete! Level: {mastery_level}. Generating personalized journey..."
            })
        
        # -------------------------------------------------------------------------
        # STEP 4: Continue Chat (Diagnostic still in progress)
        # -------------------------------------------------------------------------
        # Clean up the response if it contains partial signal text
        clean_response = response_text
        if "DIAGNOSTIC_COMPLETE" in clean_response:
            clean_response = clean_response.split("DIAGNOSTIC_COMPLETE")[0].strip()
        
        return jsonify({
            "session_id": session_id,
            "status": "chatting",
            "message": clean_response
        })
    except Exception as e:
        print(f"[ERROR] Topic mode failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# EXECUTION LOOP: Lesson Generation - See LESSON GENERATION ENDPOINT below
# =============================================================================


# =============================================================================
# EXECUTION LOOP: Quiz Generation
# =============================================================================

@app.route('/api/quiz/generate', methods=['POST'])
@limiter.limit("30 per minute")  # Rate limit AI-heavy endpoint
def generate_quiz():
    """
    Generate quiz questions (MCQ or coding challenge) based on lesson content.
    
    Request Body:
        - type (str): 'mcq' or 'coding'
        - lesson_content (str): The lesson content to base the quiz on
        - step_title (str): Title of the current step
        - difficulty (str): Difficulty level (Easy/Medium/Hard)
        
    Returns:
        MCQ question with options or coding challenge
    """
    data = request.json
    
    # Verify auth
    decoded_token, error = verify_firebase_token(request)
    if error:
        return jsonify({"error": error}), 401
    user_id = decoded_token['uid']
    
    # Check limits
    limit_status = check_generation_limit(user_id)
    if not limit_status['allowed']:
        return jsonify({
            "error": "Daily generation limit reached",
            "limit_exceeded": True
        }), 403
        
    use_generation(user_id)
    
    quiz_type = data.get('type', 'mcq')
    lesson_content = data.get('lesson_content', '')[:1500]  # Limit content length
    step_title = data.get('step_title', 'Unknown Topic')
    difficulty = data.get('difficulty', 'Easy')
    
    print(f"[Quiz] Generating {quiz_type} quiz for: {step_title} (Difficulty: {difficulty})")
    
    try:
        runner = InMemoryRunner(agent=quiz_agent, app_name="quiz_gen_app")
        
        if quiz_type == 'mcq':
            # Randomly pick which option should be correct to avoid bias
            import random
            correct_position = random.choice(['A', 'B', 'C', 'D'])
            
            prompt = f"""
Generate ONE multiple choice question to test understanding of this lesson.

Lesson Title: {step_title}
Difficulty: {difficulty}
Lesson Content: {lesson_content}

REQUIREMENTS:
1. Create an APPLICATION-LEVEL question that tests understanding, not just memorization
2. Make it relevant to the lesson content
3. All 4 options should be plausible
4. IMPORTANT: The correct answer MUST be option {correct_position}. Place the correct answer at position {correct_position}.

OUTPUT FORMAT (JSON only, no other text):
{{
  "question": "Your question here about {step_title}?",
  "options": [
    {{"id": "A", "text": "Option A text"}},
    {{"id": "B", "text": "Option B text"}},
    {{"id": "C", "text": "Option C text"}},
    {{"id": "D", "text": "Option D text"}}
  ],
  "correctId": "{correct_position}",
  "explanation": "Brief explanation of why this answer is correct"
}}
"""
        else:  # coding challenge
            prompt = f"""
Generate a coding challenge based on this lesson.

Lesson Title: {step_title}
Difficulty: {difficulty}
Lesson Content: {lesson_content}

REQUIREMENTS:
1. Create a practical coding exercise related to the lesson
2. Include starter code with comments
3. Provide a helpful hint

OUTPUT FORMAT (JSON only, no other text):
{{
  "question": "Write a function that...",
  "starterCode": "# Write your solution here\\ndef solution():\\n    # Your code here\\n    pass",
  "hint": "Think about using...",
  "expectedOutput": "What the correct solution should produce"
}}
"""
        
        response = run_agent_sync(runner, "quiz_gen_user", prompt, "quiz_gen_app")
        quiz_data = clean_and_parse_json(response)
        
        if quiz_data:
            return jsonify(quiz_data)
        else:
            # Fallback response
            if quiz_type == 'mcq':
                import random
                # Create options with the correct one at a random position
                options_list = [
                    {"id": "A", "text": "Understanding the fundamentals"},
                    {"id": "B", "text": "Advanced implementation only"},
                    {"id": "C", "text": "Deprecated techniques"},
                    {"id": "D", "text": "None of the above"}
                ]
                # Shuffle the options while keeping track of the correct one
                correct_text = "Understanding the fundamentals"
                random.shuffle(options_list)
                # Re-assign IDs after shuffle
                for i, opt in enumerate(options_list):
                    opt["id"] = chr(65 + i)  # A, B, C, D
                # Find the new position of the correct answer
                correct_id = next(opt["id"] for opt in options_list if opt["text"] == correct_text)
                
                return jsonify({
                    "question": f"What is the primary concept covered in {step_title}?",
                    "options": options_list,
                    "correctId": correct_id,
                    "explanation": "The lesson covers fundamental concepts."
                })
            else:
                return jsonify({
                    "question": f"Practice implementing a solution related to {step_title}",
                    "starterCode": "# Write your solution here\ndef solution():\n    pass",
                    "hint": "Apply the concepts from the lesson",
                    "expectedOutput": "Correct implementation"
                })
                
    except Exception as e:
        print(f"[ERROR] Quiz generation failed: {e}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# EXECUTION LOOP: Quiz/Code Submission
# =============================================================================

@app.route('/api/module/submit', methods=['POST'])
def submit_module_task():
    """
    Submit code or quiz answer for evaluation.
    
    Request Body:
        - type (str): 'code' or 'quiz'
        - content (str): User's code or answer
        - language (str, optional): Programming language (for code)
        - question (str, optional): Original question/problem
        
    Returns:
        Evaluation feedback JSON
    """
    data = request.json
    task_type = data.get('type', 'quiz')
    content = data.get('content', '')
    language = data.get('language', 'python')
    question = data.get('question', '')
    
    print(f"[Quiz] Evaluating {task_type} submission (Language: {language})")
    
    try:
        # For React/JavaScript code, use Gemini for static analysis
        # since we can't execute React components directly
        if language.lower() in ['javascript', 'jsx', 'tsx', 'react']:
            import google.generativeai as genai
            import os
            
            genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
            model = genai.GenerativeModel('gemini-2.0-flash')
            
            prompt = f"""You are a code reviewer evaluating a React/JavaScript code submission.

**Problem/Task:**
{question}

**Submitted Code:**
```javascript
{content}
```

**Evaluate the code and respond in this exact JSON format:**
{{
  "correct": true or false,
  "feedback": "Your detailed feedback here explaining what's good or what needs improvement"
}}

**Evaluation criteria:**
1. Does the code solve the problem correctly?
2. Is the syntax correct for React/JavaScript?
3. Are the component props used correctly?
4. Does the JSX render what's expected?
5. Are there any missing imports or exports?

Be encouraging but accurate. If the code is mostly correct with minor issues, mark it as correct but note the improvements."""

            response = model.generate_content(prompt)
            result_text = response.text.strip()
            
            # Try to parse JSON from response
            feedback = clean_and_parse_json(result_text)
            if not feedback:
                # If no valid JSON, infer from text
                is_correct = 'correct' in result_text.lower() or 'good' in result_text.lower() or 'well done' in result_text.lower()
                feedback = {"correct": is_correct, "feedback": result_text}
            
            return jsonify(feedback)
        
        # For Python and other executable languages, use the quiz agent
        runner = InMemoryRunner(agent=quiz_agent, app_name="quiz_app")
        
        if task_type == 'code':
            prompt = f"""
Evaluate this code submission:
Language: {language}
Problem: {question}

Code:
```{language}
{content}
```

Run the code using piston_execute and provide feedback.
"""
        else:
            prompt = f"""
Evaluate this quiz answer:
Question: {question}
User's Answer: {content}

Provide feedback on correctness and completeness.
"""
        
        response = run_agent_sync(runner, "quiz_user", prompt, "quiz_app")
        feedback = clean_and_parse_json(response)
        
        if not feedback:
            feedback = {"feedback": response, "correct": None}
        
        return jsonify(feedback)
    except Exception as e:
        print(f"[ERROR] Quiz evaluation failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "feedback": f"Evaluation error: {str(e)}", "correct": False}), 500


# =============================================================================
# EXECUTION LOOP: SRS Flashcard Actions
# =============================================================================

@app.route('/api/srs/action', methods=['POST'])
def srs_action():
    """
    Perform SRS (flashcard) actions.
    
    Request Body:
        - action (str): 'create', 'review', or 'update'
        - front (str): Question (for create)
        - back (str): Answer (for create)
        - card_id (str): Card ID (for update)
        - quality (int): Recall quality 0-5 (for update)
        
    Returns:
        Action result
    """
    data = request.json
    action = data.get('action', 'review')
    
    print(f"[SRS] Processing action: {action}")
    
    try:
        runner = InMemoryRunner(agent=srs_agent, app_name="srs_app")
        
        if action == 'create':
            prompt = f"""
Create a flashcard:
Front (Question): {data.get('front', '')}
Back (Answer): {data.get('back', '')}
"""
        elif action == 'review':
            prompt = "Start a review session. Get all due cards and present them."
        elif action == 'update':
            prompt = f"""
Update card schedule:
Card ID: {data.get('card_id', '')}
Recall Quality: {data.get('quality', 3)}
"""
        else:
            return jsonify({"error": f"Unknown action: {action}"}), 400
        
        response = run_agent_sync(runner, "srs_user", prompt, "srs_app")
        srs_result = clean_and_parse_json(response)
        
        if not srs_result:
            srs_result = {"result": response}
        
        return jsonify(srs_result)
    except Exception as e:
        print(f"[ERROR] SRS action failed: {e}")
        return jsonify({"error": str(e)}), 500


# =============================================================================
# FLASHCARD REST API
# =============================================================================

@app.route('/api/flashcards/due', methods=['GET'])
def get_flashcards_due():
    """Get flashcards due for review."""
    decoded_token, error = verify_firebase_token(request)
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    cards = get_due_flashcards(user_id)
    
    return jsonify({
        "cards": cards,
        "due_count": len(cards)
    })


@app.route('/api/flashcards/<card_id>/review', methods=['POST'])
def review_flashcard(card_id):
    """Update flashcard schedule after review."""
    decoded_token, error = verify_firebase_token(request)
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    quality = data.get('quality', 3)
    
    result = update_flashcard_schedule(user_id, card_id, quality)
    return jsonify(result or {"success": True})


@app.route('/api/flashcards/stats', methods=['GET'])
def flashcard_stats():
    """Get flashcard statistics."""
    decoded_token, error = verify_firebase_token(request)
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    stats = get_flashcard_stats(user_id)
    return jsonify(stats)


@app.route('/api/flashcards', methods=['POST'])
def create_flashcard_endpoint():
    """Create a new flashcard."""
    decoded_token, error = verify_firebase_token(request)
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    
    card_id = save_flashcard(
        user_id=user_id,
        front=data.get('front', ''),
        back=data.get('back', ''),
        tags=data.get('tags', []),
        journey_id=data.get('journey_id'),
        node_id=data.get('node_id')
    )
    
    return jsonify({"card_id": card_id, "success": bool(card_id)})


@app.route('/api/flashcards/generate', methods=['POST'])
def generate_flashcards():
    """Generate flashcards from completed lesson content using AI."""
    decoded_token, error = verify_firebase_token(request)
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    
    # Check limits
    limit_status = check_generation_limit(user_id)
    if not limit_status['allowed']:
        return jsonify({
            "error": "Daily generation limit reached",
            "limit_exceeded": True
        }), 403
        
    use_generation(user_id)
    
    data = request.json
    title = data.get('title', '')
    content = data.get('content', '')
    journey_id = data.get('journey_id')
    node_id = data.get('node_id')
    
    if not content:
        return jsonify({"error": "No content provided"}), 400
    
    try:
        # Use AI to generate flashcards from lesson content
        prompt = f"""Based on this lesson about "{title}", generate 2-3 flashcards for the key concepts.

Lesson content:
{content[:2000]}

Return ONLY a JSON array with this exact format:
[
  {{"front": "Question about key concept?", "back": "Clear concise answer (1-2 sentences)"}},
  {{"front": "Another question?", "back": "Another answer"}}
]

Focus on important facts, definitions, and concepts. Keep questions clear and answers brief."""
        
        runner = InMemoryRunner(agent=lesson_agent, app_name="flashcard_gen_app")
        response = run_agent_sync(runner, "flashcard_gen_user", prompt, "flashcard_gen_app")
        flashcard_data = clean_and_parse_json(response)
        
        created_cards = []
        if flashcard_data and isinstance(flashcard_data, list):
            for card in flashcard_data[:3]:  # Limit to 3 cards
                if card.get('front') and card.get('back'):
                    card_id = save_flashcard(
                        user_id=user_id,
                        front=card.get('front', ''),
                        back=card.get('back', ''),
                        tags=[title] if title else [],
                        journey_id=journey_id,
                        node_id=node_id
                    )
                    if card_id:
                        created_cards.append(card_id)
            
            print(f"[Flashcards] Generated {len(created_cards)} cards for '{title}'")
        
        return jsonify({"success": True, "cards_created": len(created_cards)})
    
    except Exception as e:
        print(f"[Flashcards] Generation failed: {e}")
        return jsonify({"error": str(e), "cards_created": 0}), 500


# =============================================================================
# LESSON GENERATION ENDPOINT
# =============================================================================

@app.route('/api/lesson/generate', methods=['POST'])
@limiter.limit("20 per minute")  # Rate limit AI-heavy endpoint
def api_generate_lesson():
    """
    Generate lesson content for a specific topic/step.
    
    Request Body:
        - title (str): The title of the lesson step
        - user_level (str): 'Beginner', 'Intermediate', or 'Advanced'
        - context (str): Additional context about the lesson
        
    Returns:
        - content: The generated lesson content in Markdown format
    """
    try:
        # Verify auth
        decoded_token, error = verify_firebase_token(request)
        if error:
            return jsonify({"error": error}), 401
        user_id = decoded_token['uid']
    
        data = request.json
        title = data.get('title', 'Introduction')
        user_level = data.get('user_level', 'Beginner')
        context = data.get('context', '')
        
        # Caching parameters
        journey_id = data.get('journey_id', '')
        node_id = data.get('node_id', '')
        step_id = data.get('step_id', '')
        
        print(f"[Lesson] Request for: {title} (Level: {user_level}, Journey: {journey_id}, Node: {node_id}, Step: {step_id})")
        
        # Check cache first if we have valid cache keys (journey_id must not be empty)
        if journey_id and journey_id.strip() and node_id and step_id:
            cached_lesson = get_lesson(journey_id, node_id, step_id, title)  # Pass title for hash-based lookup
            if cached_lesson:
                # Verify the cached content matches the requested title
                cached_title = cached_lesson.get('title', '')
                if cached_title.lower().strip() == title.lower().strip():
                    print(f"[Lesson] Returning cached lesson: {title}")
                    return jsonify({
                        "title": cached_lesson.get('title', title),
                        "content": cached_lesson.get('content', ''),
                        "level": cached_lesson.get('level', user_level),
                        "cached": True
                    })
                else:
                    print(f"[Lesson] Cache mismatch: requested '{title}' but found '{cached_title}', regenerating")
        
        print(f"[Lesson] Generating new lesson for: {title} (Level: {user_level})")
        
        # Check limits (only for NEW generations, cached is free)
        limit_status = check_generation_limit(user_id)
        if not limit_status['allowed']:
            return jsonify({
                "error": "Daily generation limit reached",
                "limit_exceeded": True,
                "tier": limit_status['tier']
            }), 403
            
        use_generation(user_id)
        
        # Use direct Gemini API for more reliable generation
        import google.generativeai as genai
        import os
        
        genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        prompt = f"""You are an expert educator. Generate an engaging lesson on: **{title}**

User Level: {user_level}
Context: {context}

Create a well-structured lesson with:

## 🎯 Introduction
Hook the learner with why this topic matters (2-3 sentences)

## 📚 Key Concepts
- Explain the main ideas clearly
- Use bullet points for easy reading
- Include analogies for complex topics

## 💡 Examples
- Provide 2-3 concrete examples
- Include code snippets if applicable
- Show real-world applications

## 🔑 Key Takeaways
- 3-5 important points to remember

Use emojis to make it engaging. Format in clean Markdown."""

        response = model.generate_content(prompt)
        content = response.text.strip()
        
        # Clean up markdown code blocks if present
        if content.startswith('```markdown'):
            content = content[len('```markdown'):].strip()
        if content.startswith('```'):
            content = content[3:].strip()
        if content.endswith('```'):
            content = content[:-3].strip()
        
        # Validate content is not empty
        if not content or len(content) < 50:
            print(f"[Lesson] Warning: Generated content too short ({len(content) if content else 0} chars)")
            # Generate fallback content
            content = f"""## 🎯 {title}

### Introduction
Welcome to this lesson on **{title}**! This is designed for {user_level.lower()} learners.

### 📚 Overview
{context if context else f'In this lesson, we will explore the fundamentals of {title}.'}

### 💡 Key Points
- Understanding the basics of {title}
- Common applications and use cases
- Best practices to keep in mind

### 🔑 Summary
{title} is an important topic that forms the foundation for more advanced concepts. Take your time to understand each concept before moving forward.

*Tip: Try to relate these concepts to real-world examples you encounter daily!*
"""
        
        print(f"[Lesson] Generated {len(content)} characters of content")
        
        # Save to cache if we have valid cache keys
        if journey_id and node_id and step_id:
            save_lesson(journey_id, node_id, step_id, content, title, user_level)
        
        return jsonify({
            "title": title,
            "content": content,
            "level": user_level,
            "cached": False
        })
            
    except Exception as e:
        print(f"[ERROR] Lesson generation failed: {e}")
        import traceback
        traceback.print_exc()
        
        # Always return helpful content even on error
        fallback_content = f"""## 🎯 {title}

### About This Lesson
We're currently experiencing some technical difficulties generating the full lesson content.

### 📚 Topic Overview
**{title}** - Level: {user_level}

{context if context else 'This lesson covers important concepts in this topic area.'}

### 💡 What You'll Learn
- Core concepts of {title}
- Practical applications
- Key terminology and definitions

### 🔄 Next Steps
Please try refreshing the page in a moment, or continue to the quiz section to test your knowledge.

*Don't worry - your progress is saved!*
"""
        return jsonify({
            "title": title,
            "content": fallback_content,
            "level": user_level,
            "error": str(e)
        })


# =============================================================================
# AI TUTOR CHAT API
# =============================================================================

@app.route('/api/tutor/chat', methods=['POST'])
def tutor_chat():
    """
    AI Tutor chat endpoint - handles user questions and returns AI responses.
    
    Request Body:
        - message (str): User's question or message
        
    Returns:
        - response (str): AI tutor's response
        - session_id (str): Session identifier for context continuity
    """
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    user_message = data.get('message', '').strip()
    
    if not user_message:
        return jsonify({"error": "Message is required"}), 400
    
    # Check limits
    limit_status = check_generation_limit(user_id)
    if not limit_status['allowed']:
        return jsonify({
            "error": "Daily generation limit reached",
            "limit_exceeded": True,
            "tier": limit_status['tier']
        }), 403
        
    use_generation(user_id)
    
    print(f"[Tutor] User {user_id}: {user_message[:50]}...")
    
    try:
        # Check for existing session or create new one
        if user_id not in tutor_sessions:
            # Create new tutor runner for this user
            runner = InMemoryRunner(agent=tutor_agent, app_name="tutor_app")
            
            # Create session using the background event loop
            adk_session_id = run_async(
                create_session_async(runner, "tutor_app", user_id)
            )
            
            tutor_sessions[user_id] = {
                "runner": runner,
                "adk_session_id": adk_session_id
            }
            print(f"[Tutor] Created new session for user {user_id}")
        
        session_data = tutor_sessions[user_id]
        runner = session_data["runner"]
        adk_session_id = session_data["adk_session_id"]
        
        # Save user message to history
        save_tutor_message(user_id, "user", user_message)
        
        # Run the tutor agent
        response_text = run_async(
            run_agent_async(runner, user_id, adk_session_id, user_message)
        )
        
        # Clean up the response
        response_text = response_text.strip()
        if not response_text:
            response_text = "I'm sorry, I couldn't process that. Could you please rephrase your question?"
        
        # Save assistant response to history
        save_tutor_message(user_id, "assistant", response_text)
        
        print(f"[Tutor] Response: {response_text[:100]}...")
        
        return jsonify({
            "response": response_text,
            "session_id": adk_session_id
        })
        
    except Exception as e:
        print(f"[Tutor] Error: {e}")
        import traceback
        traceback.print_exc()
        
        # Clear potentially broken session
        if user_id in tutor_sessions:
            del tutor_sessions[user_id]
        
        return jsonify({
            "error": "Failed to process message",
            "details": str(e)
        }), 500


@app.route('/api/tutor/history', methods=['GET'])
def get_tutor_chat_history():
    """
    Get tutor chat history for the current user.
    
    Returns:
        - messages: List of chat messages with role, content, and timestamp
    """
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    limit = request.args.get('limit', 50, type=int)
    
    messages = get_tutor_history(user_id, limit)
    
    return jsonify({"messages": messages})


@app.route('/api/tutor/history', methods=['DELETE'])
def delete_tutor_chat_history():
    """
    Clear tutor chat history for the current user.
    
    Returns:
        - success: Boolean indicating if the operation was successful
    """
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    
    # Clear history from Firestore
    success = clear_tutor_history(user_id)
    
    # Also clear the in-memory session to start fresh
    if user_id in tutor_sessions:
        del tutor_sessions[user_id]
    
    return jsonify({"success": success})


# =============================================================================
# JOURNEY EXPANSION (MIND MAP) ENDPOINTS
# =============================================================================

@app.route('/api/journey/suggest-topics', methods=['POST'])
def suggest_expansion_topics():
    """
    Get AI-suggested topics for expanding a completed node.
    
    Request Body:
        - parent_topic (str): The title of the completed node
        - expansion_type (str): 'deeper' or 'broader'
        - context (str, optional): Additional context about the learning journey
        
    Returns:
        - suggestions: List of 3-4 suggested topic names
    """
    data = request.json
    parent_topic = data.get('parent_topic', '')
    expansion_type = data.get('expansion_type', 'deeper')
    context = data.get('context', '')
    
    if not parent_topic:
        return jsonify({"error": "parent_topic is required"}), 400
    
    print(f"[Expansion] Suggesting {expansion_type} topics for: {parent_topic}")
    
    try:
        import google.generativeai as genai
        import os
        
        genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        if expansion_type == 'deeper':
            prompt = f"""Based on the learning topic "{parent_topic}", suggest 4 sub-topics that go DEEPER into this subject.
These should be more specific, advanced, or detailed aspects of the parent topic.
{f'Context: {context}' if context else ''}

Examples of "deeper" topics:
- If parent is "Arrays": suggest "Array Sorting Algorithms", "Two-Pointer Technique", "Dynamic Arrays"
- If parent is "Machine Learning": suggest "Neural Network Architectures", "Backpropagation", "Gradient Descent"

Return ONLY a JSON array of 4 topic names, no explanation:
["Topic 1", "Topic 2", "Topic 3", "Topic 4"]"""
        else:  # broader
            prompt = f"""Based on the learning topic "{parent_topic}", suggest 4 RELATED topics that are on the same level but cover different aspects.
These should be parallel concepts, alternatives, or related areas of study.
{f'Context: {context}' if context else ''}

Examples of "broader" topics:
- If parent is "Arrays": suggest "Linked Lists", "Hash Tables", "Stacks and Queues"
- If parent is "React Hooks": suggest "State Management", "Context API", "Redux"

Return ONLY a JSON array of 4 topic names, no explanation:
["Topic 1", "Topic 2", "Topic 3", "Topic 4"]"""
        
        response = model.generate_content(prompt)
        result = response.text.strip()
        
        # Try to parse JSON
        suggestions = clean_and_parse_json(result)
        
        if not suggestions or not isinstance(suggestions, list):
            # Fallback: try to extract from text
            import re
            matches = re.findall(r'"([^"]+)"', result)
            suggestions = matches[:4] if matches else [
                f"Advanced {parent_topic}",
                f"{parent_topic} Applications",
                f"{parent_topic} Best Practices",
                f"{parent_topic} Deep Dive"
            ]
        
        return jsonify({"suggestions": suggestions[:4]})
        
    except Exception as e:
        print(f"[ERROR] Topic suggestion failed: {e}")
        # Return sensible fallbacks
        fallback = [
            f"Advanced {parent_topic}",
            f"{parent_topic} in Practice",
            f"{parent_topic} Patterns",
            f"Beyond {parent_topic}"
        ] if expansion_type == 'deeper' else [
            f"Related to {parent_topic}",
            f"Alternative to {parent_topic}",
            f"Complementary Skills",
            f"Next Steps"
        ]
        return jsonify({"suggestions": fallback})


@app.route('/api/journey/expand', methods=['POST'])
def expand_journey_node():
    """
    Expand a journey by adding a new node (deeper or broader).
    
    Request Body:
        - journey_id (str): The journey ID
        - parent_node_id (str): The completed node to expand from
        - expansion_type (str): 'deeper' or 'broader'
        - topic (str): The topic for the new node
        
    Returns:
        - node: The newly created JourneyNode data
        - edge: The edge connecting to the parent node
    """
    decoded_token, error = verify_firebase_token(request)
    
    if error:
        return jsonify({"error": error}), 401
    
    user_id = decoded_token['uid']
    data = request.json
    
    journey_id = data.get('journey_id', '')
    parent_node_id = data.get('parent_node_id', '')
    expansion_type = data.get('expansion_type', 'deeper')
    topic = data.get('topic', '')
    
    # Check limits
    limit_status = check_generation_limit(user_id)
    if not limit_status['allowed']:
        return jsonify({
            "error": "Daily generation limit reached",
            "limit_exceeded": True
        }), 403
        
    use_generation(user_id)
    
    if not all([journey_id, parent_node_id, topic]):
        return jsonify({"error": "journey_id, parent_node_id, and topic are required"}), 400
    
    print(f"[Expansion] Expanding {parent_node_id} ({expansion_type}) with topic: {topic}")
    
    try:
        # Generate a unique node ID
        new_node_id = f"node-{uuid.uuid4().hex[:8]}"
        
        # Generate steps for the new node using Gemini
        import google.generativeai as genai
        import os
        
        genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        prompt = f"""Create a learning module structure for the topic: "{topic}"

Generate 3-5 learning steps that cover this topic progressively.
Each step should have a type: 'theory' (reading), 'code' (coding exercise), or 'quiz' (assessment).

Return ONLY a JSON array of steps:
[
  {{"id": "step-1", "title": "Step Title", "type": "theory", "description": "Brief description"}},
  {{"id": "step-2", "title": "Step Title", "type": "code", "description": "Brief description"}},
  ...
]"""
        
        response = model.generate_content(prompt)
        steps = clean_and_parse_json(response.text.strip())
        
        if not steps or not isinstance(steps, list):
            # Fallback steps
            steps = [
                {"id": f"{new_node_id}-step-1", "title": f"Introduction to {topic}", "type": "theory", "description": f"Learn the fundamentals of {topic}"},
                {"id": f"{new_node_id}-step-2", "title": f"Practice with {topic}", "type": "code", "description": f"Hands-on coding exercise"},
                {"id": f"{new_node_id}-step-3", "title": f"{topic} Quiz", "type": "quiz", "description": "Test your understanding"}
            ]
        else:
            # Prefix step IDs with node ID to ensure uniqueness
            for i, step in enumerate(steps):
                step['id'] = f"{new_node_id}-step-{i+1}"
        
        # Create the new node
        new_node = {
            "id": new_node_id,
            "title": topic,
            "steps": steps,
            "status": "active",
            "prerequisites": [parent_node_id],
            "parent_id": parent_node_id,
            "expansion_type": expansion_type
        }
        
        # Create the edge
        new_edge = {
            "id": f"{parent_node_id}-{new_node_id}",
            "source": parent_node_id,
            "target": new_node_id,
            "type": "smoothstep"
        }
        
        # Update the journey in MongoDB
        db = get_db()
        try:
            query_id = ObjectId(journey_id)
        except:
            query_id = journey_id
            
        result = db.journeys.update_one(
            {"_id": query_id, "user_id": user_id},
            {
                "$push": {"nodes": new_node},
                "$set": {"updatedAt": datetime.utcnow()}
            }
        )
        
        if result.matched_count > 0:
            print(f"[Expansion] Created new node {new_node_id} for journey {journey_id}")
        else:
            print(f"[Expansion] Warning: Journey {journey_id} not found in MongoDB, returning node without persisting")
        
        return jsonify({
            "node": new_node,
            "edge": new_edge,
            "success": True
        })
        
    except Exception as e:
        print(f"[ERROR] Journey expansion failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# UTILITY ENDPOINTS
# =============================================================================

@app.route('/api/health', methods=['GET'])
@limiter.exempt  # Don't rate limit health checks
def health_check():
    """Comprehensive health check endpoint for monitoring."""
    import sys
    return jsonify({
        "status": "healthy",
        "version": "2.2.0",
        "python_version": sys.version.split()[0],
        "features": {
            "async_jobs": True,
            "rate_limiting": True,
            "caching": True,
            "ai_agents": ["diagnostic", "journey_planner", "lesson", "quiz", "srs", "tutor"]
        },
        "performance": {
            "worker_threads": 8,
            "cache_sizes": {
                "user_cache": len(user_cache),
                "lesson_cache": len(lesson_cache)
            },
            "active_sessions": len(active_sessions),
            "active_jobs": len([j for j in job_queue.values() if j["status"] == "pending"])
        },
        "timestamp": datetime.utcnow().isoformat()
    })


@app.route('/api/handshake', methods=['GET'])
def handshake():
    """Health check endpoint (legacy, use /api/health instead)."""
    return jsonify({
        "status": "ok",
        "message": "Multi-Agent Learning Companion API v2.2 (with performance optimizations)",
        "agents": ["diagnostic", "journey_planner", "lesson", "quiz", "srs", "tutor"],
        "features": ["async_jobs", "job_polling", "ai_tutor", "rate_limiting", "caching"]
    })


# =============================================================================
# MAIN - Development server (use run_server.py for production)
# =============================================================================

if __name__ == '__main__':
    print("=" * 60)
    print("Multi-Agent Learning Companion Backend v2.2")
    print("=" * 60)
    print("Performance Features:")
    print("  ✓ Rate limiting enabled (50 req/hour default)")
    print("  ✓ TTL caching enabled (user: 5min, lesson: 30min)")
    print("  ✓ Worker pool: 8 threads")
    print("=" * 60)
    print("Agents loaded:")
    print("  - Diagnostic Agent (Topic Mode)")
    print("  - Journey Planner Agent (Dual Mode)")
    print("  - Lesson Agent (Content Generation)")
    print("  - Quiz Agent (Code/Quiz Evaluation)")
    print("  - SRS Agent (Flashcard Management)")
    print("  - Tutor Agent (AI Chatbot)")
    print("=" * 60)
    print("⚠️  WARNING: Running Flask dev server")
    print("   For production, use: python run_server.py")
    print("=" * 60)
    app.run(port=5000, debug=True, threaded=True)