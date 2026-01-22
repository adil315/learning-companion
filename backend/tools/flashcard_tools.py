"""
Flashcard Tools for SRS (Spaced Repetition System).
Provides tools for flashcard creation, retrieval, and schedule management.
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

# In-memory storage for development (replace with Firestore in production)
_flashcard_store: Dict[str, Dict[str, Any]] = {}


def save_flashcard(
    front: str, 
    back: str, 
    user_id: str = "default",
    tags: Optional[List[str]] = None
) -> str:
    """
    Save a flashcard to storage with initial SRS scheduling.
    
    Use this to create flashcards for important concepts the user should remember.
    
    Args:
        front: The question or prompt side of the flashcard
        back: The answer or explanation side
        user_id: User identifier for organizing cards
        tags: Optional list of tags for categorization
        
    Returns:
        Success message with flashcard ID
    """
    card_id = str(uuid.uuid4())[:8]
    
    flashcard = {
        "id": card_id,
        "user_id": user_id,
        "front": front,
        "back": back,
        "tags": tags or [],
        "created_at": datetime.utcnow().isoformat(),
        "next_review": datetime.utcnow().isoformat(),  # Due immediately for first review
        "interval_days": 1,
        "ease_factor": 2.5,
        "repetitions": 0,
    }
    
    if user_id not in _flashcard_store:
        _flashcard_store[user_id] = {}
    
    _flashcard_store[user_id][card_id] = flashcard
    
    return f"Flashcard saved successfully (ID: {card_id})"


def get_due_cards(user_id: str = "default", limit: int = 10) -> List[Dict[str, Any]]:
    """
    Get flashcards due for review.
    
    Returns cards where next_review <= current time.
    
    Args:
        user_id: User identifier
        limit: Maximum number of cards to return
        
    Returns:
        List of flashcard dictionaries due for review
    """
    if user_id not in _flashcard_store:
        return []
    
    now = datetime.utcnow()
    due_cards = []
    
    for card in _flashcard_store[user_id].values():
        next_review = datetime.fromisoformat(card["next_review"])
        if next_review <= now:
            due_cards.append({
                "id": card["id"],
                "front": card["front"],
                "back": card["back"],
                "tags": card["tags"],
            })
            if len(due_cards) >= limit:
                break
    
    return due_cards


def update_card_schedule(card_id: str, quality: int, user_id: str = "default") -> str:
    """
    Update flashcard schedule based on recall quality (SM-2 algorithm simplified).
    
    Args:
        card_id: The flashcard ID to update
        quality: Recall quality from 0-5:
            0 = Complete blackout
            1 = Incorrect, but recognized answer
            2 = Incorrect, but easy to recall
            3 = Correct with serious difficulty
            4 = Correct with hesitation
            5 = Perfect recall
        user_id: User identifier
        
    Returns:
        Status message with next review date
    """
    if user_id not in _flashcard_store or card_id not in _flashcard_store[user_id]:
        return f"Flashcard {card_id} not found"
    
    card = _flashcard_store[user_id][card_id]
    
    # SM-2 algorithm (simplified)
    if quality < 3:
        # Failed recall - reset interval
        card["repetitions"] = 0
        card["interval_days"] = 1
    else:
        # Successful recall
        card["repetitions"] += 1
        
        if card["repetitions"] == 1:
            card["interval_days"] = 1
        elif card["repetitions"] == 2:
            card["interval_days"] = 6
        else:
            card["interval_days"] = int(card["interval_days"] * card["ease_factor"])
        
        # Update ease factor
        card["ease_factor"] = max(
            1.3,
            card["ease_factor"] + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        )
    
    # Set next review date
    next_review = datetime.utcnow() + timedelta(days=card["interval_days"])
    card["next_review"] = next_review.isoformat()
    
    return f"Card scheduled for review in {card['interval_days']} day(s)"
