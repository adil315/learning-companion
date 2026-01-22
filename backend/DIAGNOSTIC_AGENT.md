# DiagnosticAgent Implementation

## Overview

The `DiagnosticAgent` is a crucial component of the Learning Companion application that determines a user's expertise level based on a given syllabus. It uses Google's Gemini AI to generate adaptive diagnostic questions and analyze the complexity of the learning material.

## Key Features

### 1. **Adaptive Question Generation**
- Generates exactly **10 diagnostic questions** based on the input syllabus
- Questions range from **beginner to advanced** difficulty levels
- Each question targets specific topics from the syllabus
- Questions are designed to identify knowledge gaps

### 2. **Expertise Level Determination**
The agent determines one of three expertise levels:
- **Beginner**: New to the topic, needs foundational learning
- **Intermediate**: Understands basics, ready for deeper concepts
- **Advanced**: Strong foundation, ready for complex applications

### 3. **Session State Persistence**
- Saves the determined expertise level to ADK Session State under the key `user:expertise_level`
- This allows the user's expertise level to persist across all sessions
- Can be retrieved and used by other agents in the system

### 4. **Knowledge Gap Identification**
- Identifies 3-5 specific areas where learners typically struggle
- Helps personalize the learning journey
- Provides targeted recommendations

## Architecture

### Class Structure

```python
DiagnosticAgent(ADKAgent)
├── run_diagnostic(syllabus: str) -> DiagnosticResult
├── evaluate_responses(questions, responses) -> DiagnosticResult
├── get_expertise_level() -> str
└── _generate_questions(syllabus: str) -> List[Dict]
```

### SessionState Manager

```python
SessionState
├── set(key: str, value: Any) -> None
├── get(key: str, default: Any) -> Any
└── clear() -> None
```

## Usage Examples

### Basic Usage

```python
from backend.agents.diagnostic_agent import DiagnosticAgent

# Initialize agent
agent = DiagnosticAgent()

# Define syllabus
syllabus = """
Introduction to Machine Learning
- Linear Regression
- Classification Algorithms
- Neural Networks
- Deep Learning
"""

# Run diagnostic
result = agent.run_diagnostic(syllabus)

# Access results
print(f"Expertise Level: {result.expertise_level}")
print(f"Knowledge Gaps: {result.knowledge_gaps}")

# Retrieve from session state
stored_level = agent.get_expertise_level()
```

### API Endpoint Usage

```bash
# Send POST request to diagnostic endpoint
curl -X POST http://localhost:5000/api/diagnostic/run \
  -H "Content-Type: application/json" \
  -d '{
    "syllabus": "Introduction to Python Programming..."
  }'
```

**Response:**
```json
{
  "status": "success",
  "expertise_level": "beginner",
  "knowledge_gaps": [
    "Understanding of basic syntax",
    "Control flow structures",
    "Object-oriented concepts"
  ],
  "session_expertise_level": "beginner"
}
```

### Interactive Evaluation (Advanced)

```python
# Generate questions
questions = agent._generate_questions(syllabus)

# Collect user responses (in a real application)
responses = [
    "A variable stores data...",
    "A loop repeats code...",
    # ... 10 responses total
]

# Evaluate responses
result = agent.evaluate_responses(questions, responses)
```

## Implementation Details

### Question Generation Process

1. **Prompt Construction**: Creates a detailed prompt for Gemini with specific requirements
2. **API Call**: Sends request to Gemini API using the base ADKAgent
3. **JSON Parsing**: Parses the response to extract structured question data
4. **Validation**: Ensures exactly 10 questions are generated
5. **Fallback**: Provides default questions if parsing fails

### Expertise Analysis Process

1. **Syllabus Analysis**: Gemini analyzes the complexity of the syllabus
2. **Question Review**: Considers the difficulty distribution of generated questions
3. **Gap Identification**: Identifies common learning challenges
4. **Level Assignment**: Determines appropriate starting level
5. **State Persistence**: Saves to session state for future use

### Error Handling

The agent includes robust error handling:
- **JSON Parsing Errors**: Falls back to default questions
- **API Failures**: Provides safe default results
- **Validation Errors**: Ensures data conforms to Pydantic schemas
- **Logging**: Prints warnings for debugging

## Data Models

### DiagnosticResult (Pydantic Schema)

```python
class DiagnosticResult(BaseModel):
    expertise_level: str  # 'beginner', 'intermediate', or 'advanced'
    knowledge_gaps: List[str]
```

### Question Format

```python
{
    "question": "What is a variable?",
    "difficulty": "beginner",  # or 'intermediate', 'advanced'
    "topic": "Basic Programming Concepts"
}
```

## Session State Design

The `SessionState` class provides a simple key-value store:

- **Singleton Pattern**: Shared across all agent instances
- **Persistent Storage**: Values remain until explicitly cleared
- **Type-Safe**: Supports any Python object
- **Key Format**: Uses namespaced keys (e.g., `user:expertise_level`)

### Common Keys

- `user:expertise_level`: Stores the user's determined expertise level
- Can be extended with additional keys as needed

## Integration with Other Agents

Other agents can access the stored expertise level:

```python
from backend.agents.diagnostic_agent import SessionState

# In any agent
expertise_level = SessionState.get("user:expertise_level", "beginner")

# Use the level to customize content
if expertise_level == "advanced":
    # Provide advanced content
    pass
```

## Testing

### Run the Test Script

```bash
cd backend
python test_diagnostic.py
```

This will:
1. Initialize the DiagnosticAgent
2. Run a diagnostic with a sample Python syllabus
3. Display the expertise level and knowledge gaps
4. Verify session state persistence

### Expected Output

```
================================================================================
DIAGNOSTIC AGENT TEST
================================================================================

Syllabus:
    Introduction to Python Programming...

Running diagnostic...

================================================================================
DIAGNOSTIC RESULTS
================================================================================

Expertise Level: BEGINNER

Knowledge Gaps Identified:
  1. Understanding of basic syntax and data types
  2. Control flow structures
  3. Object-oriented programming concepts

Stored in Session State: beginner

================================================================================
TEST COMPLETE
================================================================================
```

## Future Enhancements

1. **Interactive Mode**: Collect user responses in real-time
2. **Question Database**: Cache generated questions for reuse
3. **Progress Tracking**: Monitor improvement over time
4. **Adaptive Difficulty**: Adjust question difficulty based on responses
5. **Multi-Language Support**: Support multiple programming languages
6. **Persistent Storage**: Save session state to database
7. **Analytics**: Track diagnostic patterns across users

## Configuration

### Environment Variables

Ensure `.env` file contains:
```
GEMINI_API_KEY=your_api_key_here
PORT=5000
```

### Model Selection

Default model: `gemini-1.5-pro-latest`

To use a different model:
```python
agent = DiagnosticAgent(model_name="gemini-1.5-flash-latest")
```

## Troubleshooting

### Common Issues

1. **API Key Not Found**
   - Ensure `GEMINI_API_KEY` is set in `.env`
   - Run `load_dotenv()` before using the agent

2. **JSON Parsing Errors**
   - The agent automatically falls back to default questions
   - Check logs for specific error messages

3. **Invalid Expertise Level**
   - Agent validates and defaults to "beginner" if invalid

4. **Session State Not Persisting**
   - Session state is in-memory and clears on restart
   - For production, implement database-backed storage

## Performance Considerations

- **Response Time**: Gemini API calls take 2-5 seconds
- **Rate Limits**: Be mindful of API quotas
- **Caching**: Consider caching results for common syllabi
- **Async Support**: Can be enhanced with async/await for better performance

## Security

- **API Key Protection**: Never expose GEMINI_API_KEY in client code
- **Input Validation**: Validate syllabus input length and content
- **Error Messages**: Don't expose internal errors to clients
- **Rate Limiting**: Implement rate limiting on API endpoints

## License

Part of the Learning Companion project.
