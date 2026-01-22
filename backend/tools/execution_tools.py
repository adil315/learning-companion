"""
Execution Tools for Code Evaluation.
Provides the piston_execute tool for running user code submissions.
"""

import requests
from typing import Dict, Any


def piston_execute(language: str, code: str) -> Dict[str, Any]:
    """
    Execute code using the Piston API (https://emkc.org/api/v2/piston).
    
    Use this tool to run user-submitted code and analyze the output.
    
    Args:
        language: Programming language (e.g., 'python', 'javascript', 'java')
        code: The source code to execute
        
    Returns:
        Dict containing:
            - stdout: Standard output from execution
            - stderr: Standard error output
            - output: Combined output
            - error: Error message if request failed
    """
    url = "https://emkc.org/api/v2/piston/execute"
    
    # Language version mapping for common languages
    language_versions = {
        "python": "3.10.0",
        "javascript": "18.15.0",
        "java": "15.0.2",
        "c": "10.2.0",
        "cpp": "10.2.0",
        "rust": "1.68.2",
        "go": "1.16.2",
    }
    
    version = language_versions.get(language.lower(), "*")
    
    payload = {
        "language": language.lower(),
        "version": version,
        "files": [{"content": code}]
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        run_data = data.get("run", {})
        return {
            "stdout": run_data.get("stdout", ""),
            "stderr": run_data.get("stderr", ""),
            "output": run_data.get("output", ""),
            "exit_code": run_data.get("code", 0),
            "signal": run_data.get("signal", None),
        }
    except requests.exceptions.Timeout:
        return {"error": "Code execution timed out (30s limit)"}
    except requests.exceptions.RequestException as e:
        return {"error": f"Execution failed: {str(e)}"}
    except Exception as e:
        return {"error": f"Unexpected error: {str(e)}"}
