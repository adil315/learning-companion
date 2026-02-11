import asyncio
import os
from dotenv import load_dotenv
from google.adk.runners import InMemoryRunner
from agents.lesson_agent import lesson_agent
from google.genai import types

# Load environment variables
load_dotenv()

async def test_lesson_generation():
    print("Testing Lesson Generation Revamp...")
    
    # Initialize runner
    runner = InMemoryRunner(agent=lesson_agent, app_name="test_app")
    
    # Create session
    session = await runner.session_service.create_session(
        app_name="test_app",
        user_id="test_user"
    )
    
    # User message
    user_message = types.Content(
        role="user",
        parts=[types.Part(text="Create a lesson about 'React Hooks' for an Intermediate learner.")]
    )
    
    print("Running agent (this might take a while as it performs searches)...")
    
    full_text = ""
    async for event in runner.run_async(
        user_id="test_user",
        session_id=session.id,
        new_message=user_message
    ):
        if hasattr(event, 'content') and event.content:
            if hasattr(event.content, 'parts'):
                for part in event.content.parts:
                    if hasattr(part, 'text') and part.text:
                        full_text += part.text
                        print(part.text, end="", flush=True)
                    if hasattr(part, 'function_call') and part.function_call:
                        print(f"\n[Tool Call] {part.function_call.name}({part.function_call.args})")
        elif hasattr(event, 'text') and event.text:
            full_text += event.text
            print(event.text, end="", flush=True)

    print("\n\nTest completed!")
    
    # Save output to a file for manual review
    with open("lesson_output_test.md", "w", encoding="utf-8") as f:
        f.write(full_text)
    
    print(f"Full lesson content saved to lesson_output_test.md")

if __name__ == "__main__":
    asyncio.run(test_lesson_generation())
