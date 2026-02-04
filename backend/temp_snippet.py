
@app.route('/api/debug/async', methods=['GET'])
def debug_async():
    """Test if the background async loop is working."""
    async def async_echo():
        await asyncio.sleep(0.1)
        return "Pong from Async Loop"
    
    try:
        result = run_async(async_echo())
        return jsonify({"status": "ok", "message": result})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500
