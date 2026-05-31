"""Central chat-completion (LLM) configuration.

Every LLM caller in the backend shares this one provider config, so switching
provider or model is a single-file change instead of editing seven call sites.

Defaults to OpenRouter (an OpenAI-compatible endpoint) using DeepSeek's chat
model, which keeps behaviour identical to the old direct-DeepSeek setup while
routing through the OpenRouter account. Override per environment:

    OPENROUTER_API_KEY   the OpenRouter API key (required for any LLM call)
    LLM_CHAT_URL         chat-completions endpoint (default: OpenRouter)
    LLM_MODEL            model id (default: deepseek/deepseek-chat)

The request shape is OpenAI-compatible, so call sites are unchanged apart from
the URL, key and model id.
"""
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

LLM_API_KEY = os.getenv("OPENROUTER_API_KEY") or ""
LLM_CHAT_URL = os.getenv("LLM_CHAT_URL") or "https://openrouter.ai/api/v1/chat/completions"
LLM_MODEL = os.getenv("LLM_MODEL") or "deepseek/deepseek-chat"
