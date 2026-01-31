"""
MongoDB database utilities for the Learning Companion application.
Handles Firebase Admin SDK initialization (for Auth) and MongoDB operations (for Data).
"""

import os
import firebase_admin
from firebase_admin import credentials, auth
from datetime import datetime
from dotenv import load_dotenv
from typing import Dict, Any, Optional, List
from pymongo import MongoClient, DESCENDING, ASCENDING
from bson import ObjectId

load_dotenv()

# Global MongoDB client instance
_mongo_client: Optional[MongoClient] = None
_db = None

def initialize_firebase():
    """Initialize Firebase Admin SDK for Authentication."""
    try:
        if not firebase_admin._apps:
            # OPTION 1: Try GOOGLE_APPLICATION_CREDENTIALS (File path)
            # This is handled automatically by ApplicationDefault() if env var is set
            
            # OPTION 2: Try FIREBASE_CREDENTIALS_JSON (Raw JSON string)
            # Useful for Render/Heroku where uploading files is harder than setting env vars
            firebase_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            
            if firebase_json:
                import json
                try:
                    cred_dict = json.loads(firebase_json)
                    cred = credentials.Certificate(cred_dict)
                    firebase_admin.initialize_app(cred)
                    print("[Firebase] Initialized via FIREBASE_CREDENTIALS_JSON")
                    return
                except Exception as json_err:
                     print(f"[Firebase] Error parsing JSON env var: {json_err}")

            # Fallback to default (File path or failure)
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            print("[Firebase] Admin SDK initialized for Auth")
    except Exception as e:
        print(f"[Firebase] Error initializing App: {e}")

# Initialize Firebase at module import - Safe Wrapper
try:
    initialize_firebase()
except Exception as e:
    print(f"CRITICAL WARNING: Firebase Init Failed at startup: {e}")


def get_db():
    """
    Get or initialize the MongoDB database connection.
    
    Returns:
        Database: MongoDB database instance
    """
    global _mongo_client, _db
    
    if _db is not None:
        return _db
        
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        print("[MongoDB] MONGO_URI not found in .env")
        return None
        
    try:
        _mongo_client = MongoClient(mongo_uri)
        # Verify connection
        _mongo_client.admin.command('ping')
        
        # Parse database name from URI or use default
        db_name = "learning_companion"
        if "appName=" in mongo_uri:
            # Keep default or parse from uri path if present
            pass
            
        _db = _mongo_client[db_name]
        print(f"[MongoDB] Connected to database: {db_name}")
        return _db
    except Exception as e:
        print(f"[MongoDB] Connection error: {e}")
        return None

# =============================================================================
# BADGE DEFINITIONS
# =============================================================================

BADGE_DEFINITIONS = [
    {"id": "first_step", "name": "First Step", "icon": "🌱", "xp_required": 10, "description": "Earned your first 10 XP"},
    {"id": "curious_mind", "name": "Curious Mind", "icon": "🧐", "xp_required": 50, "description": "Earned 50 XP"},
    {"id": "knowledge_seeker", "name": "Knowledge Seeker", "icon": "📚", "xp_required": 100, "description": "Earned 100 XP"},
    {"id": "dedicated_learner", "name": "Dedicated Learner", "icon": "🎓", "xp_required": 250, "description": "Earned 250 XP"},
    {"id": "quiz_master", "name": "Quiz Master", "icon": "🎯", "xp_required": 500, "description": "Earned 500 XP"},
    {"id": "scholar", "name": "Scholar", "icon": "📜", "xp_required": 1000, "description": "Earned 1000 XP"},
    {"id": "sage", "name": "Sage", "icon": "🧙‍♂️", "xp_required": 2500, "description": "Earned 2500 XP"},
    {"id": "master_of_learning", "name": "Master of Learning", "icon": "👑", "xp_required": 5000, "description": "Earned 5000 XP"},
]

def get_badges_for_xp(xp: int) -> List[Dict[str, Any]]:
    """Get all badges a user has earned based on their XP."""
    return [b for b in BADGE_DEFINITIONS if xp >= b["xp_required"]]

def get_next_badge(xp: int) -> Optional[Dict[str, Any]]:
    """Get the next badge the user can earn."""
    for badge in BADGE_DEFINITIONS:
        if xp < badge["xp_required"]:
            return badge
    return None

# =============================================================================
# USER MANAGEMENT
# =============================================================================

def create_user(user_id: str, display_name: str, email: str, photo_url: str = None) -> Dict[str, Any]:
    """Create a new user document in MongoDB."""
    db = get_db()
    
    initial_badges = get_badges_for_xp(0)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    user_data = {
        "_id": user_id,  # Use Firebase UID as MongoDB _id
        "displayName": display_name,
        "email": email,
        "photoURL": photo_url,
        "xp": 0,
        "badges": initial_badges,
        # Subscription & Tier fields
        "tier": "free",
        "subscription_id": None,
        "subscription_status": None,
        "subscription_end_date": None,
        # Token usage tracking
        "daily_generations_used": 0,
        "generations_reset_date": today,
        "lifetime_generations": 0,
        # Timestamps
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    }
    
    if db is None:
        # Fallback return without saving
        user_data["uid"] = user_id
        return user_data
    
    try:
        # Use upsert to avoid errors if exists
        db.users.update_one(
            {"_id": user_id},
            {"$setOnInsert": user_data},
            upsert=True
        )
        # Fetch actual data in case it existed
        return get_user(user_id) or user_data
    except Exception as e:
        print(f"Error creating user: {e}")
        user_data["uid"] = user_id
        return user_data

def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Get a user document from MongoDB."""
    db = get_db()
    
    if db is None:
        return None
    
    try:
        user = db.users.find_one({"_id": user_id})
        if user:
            user["uid"] = user["_id"] # Compat
            return user
        return None
    except Exception as e:
        print(f"Error getting user: {e}")
        return None

# =============================================================================
# SUBSCRIPTION & TOKEN LIMIT MANAGEMENT
# =============================================================================

FREE_TIER_DAILY_LIMIT = 10

def check_generation_limit(user_id: str) -> Dict[str, Any]:
    """Check if user can generate content based on their tier and usage."""
    db = get_db()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    if db is None:
        return {"allowed": True, "remaining": FREE_TIER_DAILY_LIMIT, "tier": "free", "limit_exceeded": False}
    
    try:
        user = db.users.find_one({"_id": user_id})
        
        if not user:
            return {"allowed": True, "remaining": FREE_TIER_DAILY_LIMIT, "tier": "free", "limit_exceeded": False}
        
        tier = user.get("tier", "free")
        
        # Pro users have unlimited access
        if tier == "pro":
            subscription_status = user.get("subscription_status")
            if subscription_status == "active":
                return {
                    "allowed": True, 
                    "remaining": -1,
                    "tier": "pro", 
                    "limit_exceeded": False
                }
        
        # Free tier: check daily limit
        reset_date = user.get("generations_reset_date", "")
        daily_used = user.get("daily_generations_used", 0)
        
        # Reset counter if it's a new day
        if reset_date != today:
            db.users.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "daily_generations_used": 0,
                        "generations_reset_date": today,
                        "updatedAt": datetime.utcnow()
                    }
                }
            )
            daily_used = 0
        
        remaining = max(0, FREE_TIER_DAILY_LIMIT - daily_used)
        limit_exceeded = daily_used >= FREE_TIER_DAILY_LIMIT
        
        # Calculate reset time
        next_reset = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        from datetime import timedelta
        next_reset += timedelta(days=1)
        
        return {
            "allowed": not limit_exceeded,
            "remaining": remaining,
            "tier": "free",
            "limit_exceeded": limit_exceeded,
            "daily_used": daily_used,
            "daily_limit": FREE_TIER_DAILY_LIMIT,
            "reset_time": next_reset.isoformat() + "Z"
        }
        
    except Exception as e:
        print(f"[Subscription] Error checking limit: {e}")
        return {"allowed": True, "remaining": FREE_TIER_DAILY_LIMIT, "tier": "free", "limit_exceeded": False}

def use_generation(user_id: str) -> bool:
    """Consume one generation from user's daily limit."""
    db = get_db()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    if db is None:
        return True
    
    try:
        user = db.users.find_one({"_id": user_id})
        if not user:
            return True
        
        tier = user.get("tier", "free")
        
        if tier == "pro" and user.get("subscription_status") == "active":
            db.users.update_one(
                {"_id": user_id},
                {"$inc": {"lifetime_generations": 1}}
            )
            return True
            
        # Free tier
        reset_date = user.get("generations_reset_date", "")
        daily_used = user.get("daily_generations_used", 0)
        
        if reset_date != today:
            # Should have been reset by check, but handle race condition
            daily_used = 0
            
        if daily_used >= FREE_TIER_DAILY_LIMIT:
            return False
            
        db.users.update_one(
            {"_id": user_id},
            {
                "$inc": {"daily_generations_used": 1, "lifetime_generations": 1},
                "$set": {"generations_reset_date": today}
            }
        )
        return True
        
    except Exception as e:
        print(f"[Subscription] Error using generation: {e}")
        return True

def upgrade_to_pro(user_id: str, subscription_id: str, plan_type: str = "monthly") -> bool:
    """Upgrade user to Pro tier."""
    db = get_db()
    if db is None:
        return False
    
    try:
        # Calculate renewal date based on plan
        from datetime import timedelta
        now = datetime.utcnow()
        duration_days = 365 if plan_type == 'yearly' else 30
        end_date = now + timedelta(days=duration_days)
        
        db.users.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "tier": "pro",
                    "subscription_id": subscription_id,
                    "subscription_status": "active",
                    "subscription_plan": plan_type,
                    "subscription_start_date": now,
                    "subscription_end_date": end_date,
                    "updatedAt": now
                }
            }
        )
        return True
    except Exception as e:
        print(f"Error upgrading user: {e}")
        return False

def cancel_subscription(user_id: str) -> bool:
    """Cancel user's Pro subscription."""
    db = get_db()
    if db is None:
        return False
        
    try:
        db.users.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "subscription_status": "cancelled",
                    "updatedAt": datetime.utcnow()
                }
            }
        )
        return True
    except Exception as e:
        print(f"Error cancelling subscription: {e}")
        return False

def get_user_usage(user_id: str) -> Dict[str, Any]:
    """Get user's usage statistics."""
    limit_info = check_generation_limit(user_id)
    user = get_user(user_id)
    
    return {
        "tier": limit_info["tier"],
        "subscription_status": user.get("subscription_status") if user else None,
        "daily_limit": FREE_TIER_DAILY_LIMIT,
        "remaining": limit_info["remaining"],
        "reset_time": limit_info.get("reset_time"),
        "lifetime_generations": user.get("lifetime_generations", 0) if user else 0
    }

def update_user_xp(user_id: str, xp_to_add: int) -> Dict[str, Any]:
    """Add XP to a user and check for new badge unlocks."""
    db = get_db()
    
    if db is None:
        return {"xp": 0, "badges": get_badges_for_xp(0)}
    
    try:
        user = db.users.find_one({"_id": user_id})
        current_xp = user.get("xp", 0) if user else 0
        
        # If user doesn't exist, create them implicitly via create_user fallback or handle here
        if not user:
            # We skip implicit creation for now to match flow
            pass

        new_xp = current_xp + xp_to_add
        new_badges = get_badges_for_xp(new_xp)
        old_badges = user.get("badges", []) if user else []
        old_badge_ids = {b['id'] for b in old_badges}
        
        next_badge = get_next_badge(new_xp)
        
        # Check for newly unlocked badges
        newly_unlocked = [b for b in new_badges if b['id'] not in old_badge_ids]
        
        full_new_badges = old_badges + newly_unlocked # Preserve earned ones? No, get_badges_for_xp returns ALL earned.
        # But maybe we want to keep acquisition dates?
        # Simplicity: just overwrite list with calculated badges
        
        db.users.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "xp": new_xp,
                    "badges": new_badges,
                    "updatedAt": datetime.utcnow()
                }
            },
            upsert=True
        )
        
        result = {
            "xp": new_xp,
            "xp_gained": xp_to_add,
            "badges": new_badges,
            "newly_unlocked": newly_unlocked,
            "next_badge": next_badge
        }
        
        return result
            
    except Exception as e:
        print(f"Error updating XP: {e}")
        return {"xp": 0, "badges": get_badges_for_xp(0)}

# =============================================================================
# JOURNEY MANAGEMENT
# =============================================================================

def get_user_journeys(user_id: str) -> List[Dict[str, Any]]:
    """Get all journeys for a user."""
    db = get_db()
    if db is None:
        return []
    
    try:
        cursor = db.journeys.find({"user_id": user_id}).sort("created_at", DESCENDING)
        journeys = []
        for doc in cursor:
            doc["id"] = str(doc["_id"])
            journeys.append(doc)
        return journeys
    except Exception as e:
        print(f"Error getting journeys: {e}")
        return []

def save_user_journey(user_id: str, journey_data: Dict[str, Any]) -> str:
    """Save a journey for a user."""
    db = get_db()
    if db is None:
        return None
        
    try:
        journey_data["user_id"] = user_id
        if "created_at" not in journey_data:
            journey_data["created_at"] = datetime.utcnow().isoformat()
            
        result = db.journeys.insert_one(journey_data)
        return str(result.inserted_id)
    except Exception as e:
        print(f"Error saving journey: {e}")
        return None

def save_journey_map(map_data: dict, user_id: str) -> str:
    """Save a journey map."""
    # This seems redundant with save_user_journey but used by different agent?
    return save_user_journey(user_id, map_data)

def get_journey_map(user_id: str, map_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve a journey map."""
    db = get_db()
    if db is None:
        return None
    
    try:
        # Handle ObjectId conversion if map_id is string
        try:
            query_id = ObjectId(map_id)
        except:
            query_id = map_id
            
        doc = db.journeys.find_one({"_id": query_id, "user_id": user_id})
        if doc:
            doc["id"] = str(doc["_id"])
            return doc
        return None
    except Exception as e:
        print(f"Error getting journey map: {e}")
        return None

def get_latest_journey_map(user_id: str) -> Optional[Dict[str, Any]]:
    """Get the most recently created journey map."""
    db = get_db()
    if db is None:
        return None
    
    try:
        doc = db.journeys.find_one({"user_id": user_id}, sort=[("created_at", DESCENDING)])
        if doc:
            doc["id"] = str(doc["_id"])
            return doc
        return None
    except Exception as e:
        print(f"Error getting latest journey: {e}")
        return None

# =============================================================================
# LESSON CACHING
# =============================================================================

def save_lesson(journey_id: str, node_id: str, step_id: str, content: str, title: str, level: str) -> bool:
    """Save generated lesson content."""
    db = get_db()
    if db is None:
        return False
        
    try:
        lesson_data = {
            "journey_id": journey_id,
            "node_id": node_id,
            "step_id": step_id,
            "content": content,
            "title": title,
            "level": level,
            "created_at": datetime.utcnow()
        }
        
        # Upsert based on composite key
        db.lessons.update_one(
            {"journey_id": journey_id, "node_id": node_id, "step_id": step_id},
            {"$set": lesson_data},
            upsert=True
        )
        return True
    except Exception as e:
        print(f"Error saving lesson: {e}")
        return False

def get_lesson(journey_id: str, node_id: str, step_id: str, title: str = None) -> Optional[Dict[str, Any]]:
    """Retrieve cached lesson content."""
    db = get_db()
    if db is None:
        return None
        
    try:
        query = {"journey_id": journey_id, "node_id": node_id, "step_id": step_id}
        doc = db.lessons.find_one(query)
        if doc:
            doc["id"] = str(doc["_id"])
            return doc
        return None
    except Exception as e:
        print(f"Error getting lesson: {e}")
        return None

# =============================================================================
# TUTOR CHAT HISTORY
# =============================================================================

def save_tutor_message(user_id: str, role: str, content: str) -> bool:
    """Save a tutor chat message."""
    db = get_db()
    if db is None:
        return False
        
    try:
        msg_data = {
            "user_id": user_id,
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow()
        }
        db.chat_history.insert_one(msg_data)
        return True
    except Exception as e:
        print(f"Error saving tutor message: {e}")
        return False

def get_tutor_history(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Get recent tutor chat history."""
    db = get_db()
    if db is None:
        return []
    
    try:
        cursor = db.chat_history.find({"user_id": user_id}).sort("timestamp", DESCENDING).limit(limit)
        # Reverse to get chronological order (oldest first)
        messages = []
        for doc in cursor:
            messages.append({"role": doc["role"], "content": doc["content"]})
        return messages[::-1]
    except Exception as e:
        print(f"Error getting tutor history: {e}")
        return []

def clear_tutor_history(user_id: str) -> bool:
    """Clear all tutor chat history for a user."""
    db = get_db()
    if db is None:
        return False
    
    try:
        db.chat_history.delete_many({"user_id": user_id})
        return True
    except Exception as e:
        print(f"Error clearing tutor history: {e}")
        return False

# =============================================================================
# FLASHCARD SRS SYSTEM
# =============================================================================

def save_flashcard(user_id: str, front: str, back: str, tags: list = None, journey_id: str = None, node_id: str = None) -> Optional[str]:
    """Save a new flashcard."""
    db = get_db()
    if db is None:
        return None
        
    try:
        card_data = {
            "user_id": user_id,
            "front": front,
            "back": back,
            "tags": tags or [],
            "journey_id": journey_id,
            "node_id": node_id,
            "step": 0,
            "interval": 0,
            "ease_factor": 2.5,
            "next_review": datetime.utcnow(),
            "created_at": datetime.utcnow(),
            "review_count": 0
        }
        
        result = db.flashcards.insert_one(card_data)
        return str(result.inserted_id)
    except Exception as e:
        print(f"Error saving flashcard: {e}")
        return None

def get_due_flashcards(user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Get flashcards due for review."""
    db = get_db()
    if db is None:
        return []
        
    try:
        query = {
            "user_id": user_id,
            "next_review": {"$lte": datetime.utcnow()}
        }
        cursor = db.flashcards.find(query).limit(limit)
        
        cards = []
        for doc in cursor:
            doc["id"] = str(doc["_id"])
            cards.append(doc)
        return cards
    except Exception as e:
        print(f"Error getting due flashcards: {e}")
        return []

def update_flashcard_schedule(user_id: str, card_id: str, quality: int) -> Optional[Dict[str, Any]]:
    """Update flashcard schedule based on recall quality (SM-2)."""
    db = get_db()
    if db is None:
        return None
        
    try:
        try:
            oid = ObjectId(card_id)
        except:
            oid = card_id
            
        card = db.flashcards.find_one({"_id": oid, "user_id": user_id})
        
        if not card:
            return None
            
        # SRS Logic (Simplified SM-2)
        step = card.get("step", 0)
        interval = card.get("interval", 0)
        ease = card.get("ease_factor", 2.5)
        
        if quality >= 3:
            if step == 0:
                interval = 1
                step = 1
            elif step == 1:
                interval = 6
                step = 2
            else:
                interval = round(interval * ease)
                step += 1
            
            # Ease factor update
            ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
            ease = max(1.3, ease)
        else:
            step = 0
            interval = 1
            # Ease remains same on failure
            
        from datetime import timedelta
        next_review = datetime.utcnow() + timedelta(days=interval)
        
        update_data = {
            "step": step,
            "interval": interval,
            "ease_factor": ease,
            "next_review": next_review,
            "last_review": datetime.utcnow()
        }
        
        db.flashcards.update_one(
            {"_id": oid},
            {
                "$set": update_data,
                "$inc": {"review_count": 1}
            }
        )
        
        return update_data
            
    except Exception as e:
        print(f"Error updating flashcard: {e}")
        return None

def get_flashcard_stats(user_id: str) -> Dict[str, int]:
    """Get flashcard statistics."""
    db = get_db()
    if db is None:
        return {"total": 0, "due": 0}
        
    try:
        total = db.flashcards.count_documents({"user_id": user_id})
        due = db.flashcards.count_documents({
            "user_id": user_id,
            "next_review": {"$lte": datetime.utcnow()}
        })
        return {"total": total, "due": due}
    except Exception as e:
        print(f"Error getting stats: {e}")
        return {"total": 0, "due": 0}


# Alias for backward compatibility
get_firestore_client = get_db
