"""Appel au format OpenAI.  pip install openai"""
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key=os.environ.get("LLM_API_KEY", "sk-local-change-me"),
)

resp = client.chat.completions.create(
    model="local",
    messages=[{"role": "user", "content": "Explique Docker en une phrase."}],
)
print(resp.choices[0].message.content)

# Streaming
stream = client.chat.completions.create(
    model="local",
    messages=[{"role": "user", "content": "Compte de 1 à 5."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
print()
