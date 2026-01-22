"""
PayPal Integration Module for Learning Companion Pro Subscriptions.
Handles subscription creation, verification, and webhook processing.
"""

import os
import requests
from datetime import datetime
from dotenv import load_dotenv
from typing import Dict, Any, Optional

load_dotenv()

# PayPal Configuration
PAYPAL_CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID")
PAYPAL_CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET")
PAYPAL_MODE = os.getenv("PAYPAL_MODE", "sandbox")

# PayPal API URLs
PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com" if PAYPAL_MODE == "sandbox" else "https://api-m.paypal.com"

# Pricing Configuration
PRICING = {
    "monthly": {
        "price": "4.99",
        "original_price": "9.99",
        "currency": "USD",
        "interval": "MONTH",
        "interval_count": 1,
        "name": "Learning Companion Pro - Monthly",
        "description": "Unlimited AI-powered learning with monthly billing"
    },
    "yearly": {
        "price": "47.90",
        "original_price": "59.88",
        "currency": "USD",
        "interval": "YEAR",
        "interval_count": 1,
        "name": "Learning Companion Pro - Yearly",
        "description": "Unlimited AI-powered learning with yearly billing (20% savings)"
    }
}


def get_access_token() -> Optional[str]:
    """
    Get PayPal OAuth access token.
    
    Returns:
        str: Access token if successful, None otherwise
    """
    if not PAYPAL_CLIENT_ID or not PAYPAL_CLIENT_SECRET:
        print("[PayPal] Missing client credentials")
        return None
    
    try:
        response = requests.post(
            f"{PAYPAL_API_BASE}/v1/oauth2/token",
            auth=(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials"}
        )
        
        if response.status_code == 200:
            return response.json().get("access_token")
        else:
            print(f"[PayPal] Failed to get access token: {response.text}")
            return None
            
    except Exception as e:
        print(f"[PayPal] Error getting access token: {e}")
        return None


def create_product() -> Optional[str]:
    """
    Create a PayPal product for subscriptions.
    
    Returns:
        str: Product ID if successful, None otherwise
    """
    access_token = get_access_token()
    if not access_token:
        return None
    
    try:
        response = requests.post(
            f"{PAYPAL_API_BASE}/v1/catalogs/products",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json={
                "name": "Learning Companion Pro",
                "description": "Unlimited AI-powered learning platform",
                "type": "SERVICE",
                "category": "EDUCATIONAL_AND_TEXTBOOKS"
            }
        )
        
        if response.status_code in [200, 201]:
            return response.json().get("id")
        else:
            print(f"[PayPal] Failed to create product: {response.text}")
            return None
            
    except Exception as e:
        print(f"[PayPal] Error creating product: {e}")
        return None


def create_subscription_plan(product_id: str, plan_type: str = "monthly") -> Optional[str]:
    """
    Create a subscription plan in PayPal.
    
    Args:
        product_id: PayPal product ID
        plan_type: 'monthly' or 'yearly'
        
    Returns:
        str: Plan ID if successful, None otherwise
    """
    access_token = get_access_token()
    if not access_token:
        return None
    
    pricing = PRICING.get(plan_type, PRICING["monthly"])
    
    try:
        response = requests.post(
            f"{PAYPAL_API_BASE}/v1/billing/plans",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json={
                "product_id": product_id,
                "name": pricing["name"],
                "description": pricing["description"],
                "billing_cycles": [
                    {
                        "frequency": {
                            "interval_unit": pricing["interval"],
                            "interval_count": pricing["interval_count"]
                        },
                        "tenure_type": "REGULAR",
                        "sequence": 1,
                        "total_cycles": 0,  # 0 = unlimited
                        "pricing_scheme": {
                            "fixed_price": {
                                "value": pricing["price"],
                                "currency_code": pricing["currency"]
                            }
                        }
                    }
                ],
                "payment_preferences": {
                    "auto_bill_outstanding": True,
                    "setup_fee_failure_action": "CONTINUE",
                    "payment_failure_threshold": 3
                }
            }
        )
        
        if response.status_code in [200, 201]:
            return response.json().get("id")
        else:
            print(f"[PayPal] Failed to create plan: {response.text}")
            return None
            
    except Exception as e:
        print(f"[PayPal] Error creating plan: {e}")
        return None


def create_subscription(plan_id: str, return_url: str, cancel_url: str) -> Dict[str, Any]:
    """
    Create a subscription for a user.
    
    Args:
        plan_id: PayPal plan ID
        return_url: URL to redirect after successful payment
        cancel_url: URL to redirect if user cancels
        
    Returns:
        Dict with 'subscription_id' and 'approval_url', or 'error'
    """
    access_token = get_access_token()
    if not access_token:
        return {"error": "Failed to authenticate with PayPal"}
    
    try:
        response = requests.post(
            f"{PAYPAL_API_BASE}/v1/billing/subscriptions",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json={
                "plan_id": plan_id,
                "application_context": {
                    "brand_name": "Learning Companion",
                    "locale": "en-US",
                    "shipping_preference": "NO_SHIPPING",
                    "user_action": "SUBSCRIBE_NOW",
                    "return_url": return_url,
                    "cancel_url": cancel_url
                }
            }
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            approval_url = None
            for link in data.get("links", []):
                if link.get("rel") == "approve":
                    approval_url = link.get("href")
                    break
            
            return {
                "subscription_id": data.get("id"),
                "approval_url": approval_url,
                "status": data.get("status")
            }
        else:
            print(f"[PayPal] Failed to create subscription: {response.text}")
            return {"error": f"PayPal error: {response.status_code}"}
            
    except Exception as e:
        print(f"[PayPal] Error creating subscription: {e}")
        return {"error": str(e)}


def get_subscription_details(subscription_id: str) -> Optional[Dict[str, Any]]:
    """
    Get subscription details from PayPal.
    
    Args:
        subscription_id: PayPal subscription ID
        
    Returns:
        Dict with subscription details, or None on error
    """
    access_token = get_access_token()
    if not access_token:
        return None
    
    try:
        response = requests.get(
            f"{PAYPAL_API_BASE}/v1/billing/subscriptions/{subscription_id}",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            print(f"[PayPal] Failed to get subscription: {response.text}")
            return None
            
    except Exception as e:
        print(f"[PayPal] Error getting subscription: {e}")
        return None


def cancel_subscription(subscription_id: str, reason: str = "User requested cancellation") -> bool:
    """
    Cancel a PayPal subscription.
    
    Args:
        subscription_id: PayPal subscription ID
        reason: Cancellation reason
        
    Returns:
        bool: True if cancelled successfully
    """
    access_token = get_access_token()
    if not access_token:
        return False
    
    try:
        response = requests.post(
            f"{PAYPAL_API_BASE}/v1/billing/subscriptions/{subscription_id}/cancel",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json={"reason": reason}
        )
        
        if response.status_code == 204:
            print(f"[PayPal] Subscription {subscription_id} cancelled")
            return True
        else:
            print(f"[PayPal] Failed to cancel subscription: {response.text}")
            return False
            
    except Exception as e:
        print(f"[PayPal] Error cancelling subscription: {e}")
        return False


def verify_webhook_signature(headers: Dict[str, str], body: bytes, webhook_id: str) -> bool:
    """
    Verify PayPal webhook signature.
    
    Args:
        headers: Request headers
        body: Raw request body
        webhook_id: PayPal webhook ID (from dashboard)
        
    Returns:
        bool: True if signature is valid
    """
    access_token = get_access_token()
    if not access_token:
        return False
    
    try:
        response = requests.post(
            f"{PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            },
            json={
                "auth_algo": headers.get("PAYPAL-AUTH-ALGO"),
                "cert_url": headers.get("PAYPAL-CERT-URL"),
                "transmission_id": headers.get("PAYPAL-TRANSMISSION-ID"),
                "transmission_sig": headers.get("PAYPAL-TRANSMISSION-SIG"),
                "transmission_time": headers.get("PAYPAL-TRANSMISSION-TIME"),
                "webhook_id": webhook_id,
                "webhook_event": body.decode("utf-8") if isinstance(body, bytes) else body
            }
        )
        
        if response.status_code == 200:
            return response.json().get("verification_status") == "SUCCESS"
        return False
        
    except Exception as e:
        print(f"[PayPal] Error verifying webhook: {e}")
        return False


def get_pricing_info() -> Dict[str, Any]:
    """
    Get pricing information for display.
    
    Returns:
        Dict with pricing details for both plans
    """
    return {
        "monthly": {
            "price": float(PRICING["monthly"]["price"]),
            "original_price": float(PRICING["monthly"]["original_price"]),
            "currency": PRICING["monthly"]["currency"],
            "name": PRICING["monthly"]["name"],
            "description": PRICING["monthly"]["description"],
            "savings": round(float(PRICING["monthly"]["original_price"]) - float(PRICING["monthly"]["price"]), 2)
        },
        "yearly": {
            "price": float(PRICING["yearly"]["price"]),
            "original_price": float(PRICING["yearly"]["original_price"]),
            "currency": PRICING["yearly"]["currency"],
            "name": PRICING["yearly"]["name"],
            "description": PRICING["yearly"]["description"],
            "savings": round(float(PRICING["yearly"]["original_price"]) - float(PRICING["yearly"]["price"]), 2),
            "monthly_equivalent": round(float(PRICING["yearly"]["price"]) / 12, 2)
        }
    }
