import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


def _resolve_config_dir() -> Path:
    explicit = (os.getenv("ZJOBLY_CONFIG_DIR") or "").strip()
    if explicit:
        return Path(explicit)
    mounted = Path("/config")
    if mounted.exists():
        return mounted
    repo_root = Path(__file__).resolve().parents[4]
    root_config = repo_root / "config"
    if root_config.exists():
        return root_config
    return Path(__file__).resolve().parent / "config"


CONFIG_DIR = _resolve_config_dir()
RUNTIME_CONFIG_PATH = CONFIG_DIR / "runtime.json"
PROMPTS_CONFIG_PATH = CONFIG_DIR / "prompts.json"


def _load_json(path: Path) -> dict[str, Any]:
    try:
        if not path.exists():
            return {}
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(parsed, dict):
        return {}
    return parsed


@lru_cache(maxsize=1)
def get_runtime_config() -> dict[str, Any]:
    return _load_json(RUNTIME_CONFIG_PATH)


@lru_cache(maxsize=1)
def get_prompts_config() -> dict[str, dict[str, Any]]:
    raw = _load_json(PROMPTS_CONFIG_PATH)
    return {key: value for key, value in raw.items() if isinstance(value, dict)}


def _get_nested_value(config: dict[str, Any], keys: tuple[str, ...]) -> Any:
    current: Any = config
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def get_runtime_int(keys: tuple[str, ...], fallback: int) -> int:
    value = _get_nested_value(get_runtime_config(), keys)
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def get_runtime_float(keys: tuple[str, ...], fallback: float) -> float:
    value = _get_nested_value(get_runtime_config(), keys)
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback
