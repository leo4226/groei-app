"""Central chat-completion (LLM) configuration.

Every LLM caller in the backend shares this one provider config, so switching
provider or model is a single-file change instead of editing seven call sites.

Defaults to Nous Portal (an OpenAI-compatible inference gateway) using
DeepSeek V4 Flash. Override per environment:

    NOUS_API_KEY   the Nous Portal API key (required for any LLM call)
    LLM_CHAT_URL   chat-completions endpoint (default: Nous Portal)
    LLM_MODEL      model id (default: deepseek/deepseek-v4-flash)

The request shape is OpenAI-compatible (Bearer auth), so call sites are
unchanged apart from the URL, key and model id.
"""
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

LLM_API_KEY = os.getenv("NOUS_API_KEY") or ""
LLM_CHAT_URL = os.getenv("LLM_CHAT_URL") or "https://inference-api.nousresearch.com/v1/chat/completions"
LLM_MODEL = os.getenv("LLM_MODEL") or "deepseek/deepseek-v4-flash"
