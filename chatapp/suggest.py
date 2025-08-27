import requests
import json

# Ollama server (change if running on another port or host)
OLLAMA_URL = "http://127.0.0.1:11434"

# System prompt ensures Ollama replies with short JSON suggestions only
SYSTEM_PROMPT = """
You generate short, safe, context-aware reply suggestions for a chat app.
Rules:
- Output JSON ONLY in the exact shape: {"suggestions": ["...", "...", "..."]}
- 3 to 5 suggestions
- Each suggestion 3–12 words
- Match tone of conversation
- No explanations, no extra text
"""

def get_suggestions(messages, model="llama3"):
    """
    messages: list of dicts like [{ "role": "user", "content": "..." }]
    returns: list of suggestion strings
    """
    # Add system instructions + last 8 messages
    formatted = [{"role": "system", "content": SYSTEM_PROMPT}] + messages[-8:]

    payload = {
        "model": model,
        "messages": formatted,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.4,
            "num_predict": 128,
            "keep_alive": "10m"
        }
    }

    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        raw = data.get("message", {}).get("content", "").strip()

        # Parse JSON from model response
        suggestions = []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed.get("suggestions"), list):
                suggestions = [s.strip() for s in parsed["suggestions"] if isinstance(s, str)]
        except Exception as e:
            print("⚠️ Could not parse JSON. Raw response was:\n", raw)

        return suggestions
    except Exception as e:
        print("❌ Error:", e)
        return []


if __name__ == "__main__":
    # Example chat history
    chat_history = [
        {"role": "user", "content": "Hey, can we meet at 6 pm?"},
        {"role": "assistant", "content": "Yes, that works for me."},
        {"role": "user", "content": "Great, also share the presentation please."}
    ]

    suggestions = get_suggestions(chat_history)

    print("\n💡 Suggested replies:")
    for i, s in enumerate(suggestions, start=1):
        print(f"{i}. {s}")
