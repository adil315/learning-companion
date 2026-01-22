"""
Diagnostic Tools for the Diagnostic Agent.
Provides the submit_diagnostic tool to signal assessment completion.
"""


def submit_diagnostic(mastery_level: str, gaps: str = "") -> str:
    """
    Signal diagnostic completion. Returns a signal string for Flask detection.
    
    Call this tool IMMEDIATELY when you have determined the user's mastery level.
    
    Args:
        mastery_level: User's assessed level - 'Beginner', 'Intermediate', or 'Advanced'
        gaps: Optional summary of identified knowledge gaps
        
    Returns:
        Signal string in format 'DIAGNOSTIC_COMPLETE:{level}' for orchestrator detection
    """
    # Validate mastery_level
    valid_levels = ["Beginner", "Intermediate", "Advanced"]
    if mastery_level not in valid_levels:
        mastery_level = "Beginner"  # Default fallback
    
    return f"DIAGNOSTIC_COMPLETE:{mastery_level}"
