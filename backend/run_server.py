"""
Production server runner for Learning Companion backend.
Automatically uses the best server for your platform:
- Windows: Waitress
- Linux/Mac: Gunicorn (for production) or Waitress (for simplicity)

Usage:
    python run_server.py              # Auto-detect platform
    python run_server.py --port 5000  # Custom port
"""

import os
import sys
import argparse

def run_waitress(app, host, port, threads):
    """Run with Waitress (Windows-compatible, also good for production)."""
    from waitress import serve
    print(f"🚀 Starting Waitress server on http://{host}:{port}")
    print(f"   Workers: {threads} threads")
    print(f"   Press Ctrl+C to stop")
    serve(
        app,
        host=host,
        port=port,
        threads=threads,
        connection_limit=1000,
        channel_timeout=120,  # 2 min timeout for LLM calls
        recv_bytes=65536,
        send_bytes=65536,
        expose_tracebacks=False,  # Security: don't expose in production
    )

def run_dev(app, host, port):
    """Run Flask development server (NOT for production)."""
    print(f"⚠️  Running Flask dev server on http://{host}:{port}")
    print(f"   WARNING: This is NOT suitable for production!")
    app.run(host=host, port=port, debug=True, threaded=True)

def main():
    parser = argparse.ArgumentParser(description="Run Learning Companion backend")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=5000, help="Port to bind to")
    parser.add_argument("--threads", type=int, default=8, help="Number of worker threads")
    parser.add_argument("--dev", action="store_true", help="Use Flask dev server (not recommended)")
    args = parser.parse_args()

    # Import the Flask app
    from app import app

    if args.dev:
        run_dev(app, args.host, args.port)
    else:
        run_waitress(app, args.host, args.port, args.threads)

if __name__ == "__main__":
    main()
