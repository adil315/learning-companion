"""
Test script to verify ADK runner usage - using sync run method.
"""
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai import types

# Create a simple test agent
test_agent = LlmAgent(
    name="test_agent",
    model="gemini-2.0-flash",
    instruction="You are a helpful assistant. Just say 'Hello World!' in response to any message."
)

def test_runner_sync():
    """Test the ADK runner with sync run method."""
    runner = InMemoryRunner(agent=test_agent, app_name="test_app")
    
    user_id = "test_user"
    
    # First create a session using the session service (sync version)
    print("Creating session...")
    import asyncio
    
    async def create_sess():
        return await runner.session_service.create_session(
            app_name="test_app",
            user_id=user_id
        )
    
    session = asyncio.run(create_sess())
    session_id = session.id
    print(f"Session created: {session_id}")
    
    # Create a proper content object
    user_content = types.Content(
        role="user",
        parts=[types.Part(text="Hi there!")]
    )
    
    print("Testing runner.run (sync)...")
    try:
        full_response = ""
        # The sync run should return a generator
        for event in runner.run(
            user_id=user_id,
            session_id=session_id,
            new_message=user_content
        ):
            print(f"Event type: {type(event).__name__}")
            if hasattr(event, 'content') and event.content:
                for part in event.content.parts:
                    if hasattr(part, 'text') and part.text:
                        full_response += part.text
                        print(f"Part text: {part.text[:100]}...")
        
        print(f"\n=== Full Response ===\n{full_response}")
        return full_response
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    result = test_runner_sync()
    print(f"\nTest complete. Got response: {result is not None}")
