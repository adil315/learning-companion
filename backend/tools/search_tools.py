"""
Search Tools for the Lesson Agent.
Provides web_search and youtube_search tools.
"""

from duckduckgo_search import DDGS
from youtubesearchpython import VideosSearch
from typing import List, Dict, Any

def web_search(query: str, max_results: int = 5) -> str:
    """
    Search the web for information using DuckDuckGo.
    
    Args:
        query: The search query string.
        max_results: Maximum number of results to return.
        
    Returns:
        A formatted string containing titles, snippets, and links.
    """
    try:
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append(f"Title: {r['title']}\nSnippet: {r['body']}\nLink: {r['href']}\n")
        
        if not results:
            return "No web search results found."
            
        return "\n---\n".join(results)
    except Exception as e:
        return f"Web search failed: {str(e)}"

def youtube_search(query: str, max_results: int = 3) -> str:
    """
    Search for relevant educational videos on YouTube.
    
    Args:
        query: The search query string.
        max_results: Maximum number of videos to return.
        
    Returns:
        A formatted string containing titles, durations, and links.
    """
    try:
        videos_search = VideosSearch(query, limit=max_results)
        results = videos_search.result()
        
        video_list = []
        for v in results.get('result', []):
            video_list.append(f"Title: {v['title']}\nDuration: {v['duration']}\nLink: {v['link']}\n")
            
        if not video_list:
            return "No YouTube videos found."
            
        return "\n---\n".join(video_list)
    except Exception as e:
        return f"YouTube search failed: {str(e)}"
