"""Appel au format Claude (Messages API).  pip install anthropic"""
import os
from anthropic import Anthropic

client = Anthropic(
    base_url="http://localhost:4000",
    api_key=os.environ.get("LLM_API_KEY", "sk-local-change-me"),
)

msg = client.messages.create(
    model="local",
    max_tokens=300,
    system="Tu réponds en français, brièvement.",
    messages=[{"role": "user", "content": "Explique Docker en une phrase."}],
)
print(msg.content[0].text)

# Streaming
with client.messages.stream(
    model="local",
    max_tokens=100,
    messages=[{"role": "user", "content": "Compte de 1 à 5."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
print()
