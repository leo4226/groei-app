"""Central chat-completion (LLM) configuration.

Every LLM caller in the backend shares this one provider config, so switching
provider or model is a single-file change instead of editing seven call sites.

Defaults to Nous Portal (an OpenAI-compatible inference gateway) using
DeepSeek V4 Flash. Override per environment:

    NOUS_API_KEY        the Nous Portal API key (required for any LLM call)
    LLM_CHAT_URL        chat-completions endpoint (default: Nous Portal)
    LLM_MODEL           model id for names/general calls (default: deepseek/deepseek-v4-pro-0813)
    LLM_PHENOLOGY_MODEL model id for full phenology generation (default: deepseek/deepseek-v4-flash-0731)
    LLM_FUN_FACT_MODEL  model id for short bilingual facts (default: deepseek/deepseek-v4-flash-0731)

The request shape is OpenAI-compatible (Bearer auth), so call sites are
unchanged apart from the URL, key and model id.

**Pin dated model ids, not bare names.** Nous resolves a bare `deepseek-v4-pro`
to a fixed snapshot (`-20260423`) rather than to the latest build, so a bare id
is not "always current" — it is an undated pin that silently ages. Dating it
makes the version visible in this file, and a model change a deliberate edit
with a diff rather than something that happens to us. `~`-prefixed ids on the
gateway (e.g. `~deepseek-v4-flash-latest`) are the genuinely floating aliases;
avoid them here for the same reason — a model swapping under a running app
changes output quality with no commit to point at.
"""
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

LLM_API_KEY = os.getenv("NOUS_API_KEY") or ""
LLM_CHAT_URL = os.getenv("LLM_CHAT_URL") or "https://inference-api.nousresearch.com/v1/chat/completions"
LLM_MODEL = os.getenv("LLM_MODEL") or "deepseek/deepseek-v4-pro-0813"
LLM_PHENOLOGY_MODEL = os.getenv("LLM_PHENOLOGY_MODEL") or "deepseek/deepseek-v4-flash-0731"
LLM_FUN_FACT_MODEL = os.getenv("LLM_FUN_FACT_MODEL") or "deepseek/deepseek-v4-flash-0731"
