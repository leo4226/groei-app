"""llm_config defaults to Nous Portal but stays env-overridable."""
import importlib
import os


def _reload(monkeypatch, **env):
    for k in ("NOUS_API_KEY", "LLM_CHAT_URL", "LLM_MODEL", "LLM_FUN_FACT_MODEL", "OPENROUTER_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    import llm_config
    return importlib.reload(llm_config)


def test_defaults_to_nous_portal(monkeypatch):
    cfg = _reload(monkeypatch, NOUS_API_KEY="secret")
    assert cfg.LLM_API_KEY == "secret"
    assert cfg.LLM_CHAT_URL == "https://inference-api.nousresearch.com/v1/chat/completions"
    assert cfg.LLM_MODEL == "deepseek/deepseek-v4-pro"
    assert cfg.LLM_FUN_FACT_MODEL == "deepseek/deepseek-v4-flash-0731"


def test_env_overrides_url_and_model(monkeypatch):
    cfg = _reload(monkeypatch, NOUS_API_KEY="k", LLM_CHAT_URL="https://x/v1/chat", LLM_MODEL="other")
    assert cfg.LLM_CHAT_URL == "https://x/v1/chat"
    assert cfg.LLM_MODEL == "other"
