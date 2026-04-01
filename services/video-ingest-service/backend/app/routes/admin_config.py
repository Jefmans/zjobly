import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.models import User
from app.routes.accounts import get_current_user
from app.system_config import (
    CONFIG_DIR,
    PROMPTS_CONFIG_PATH,
    QUESTIONS_CONFIG_PATH,
    RUNTIME_CONFIG_PATH,
    clear_system_config_cache,
    get_runtime_config,
)

router = APIRouter(prefix="/accounts/admin/config", tags=["admin-config"])


class ConfigBundle(BaseModel):
    runtime: dict[str, Any]
    questions: dict[str, Any]
    prompts: dict[str, Any]


def _is_admin_config_enabled() -> bool:
    if settings.CONFIG_ADMIN_ENABLED:
        return True
    runtime = get_runtime_config()
    ui = runtime.get("ui") if isinstance(runtime, dict) else None
    if isinstance(ui, dict):
        return ui.get("showDevelopmentNavigation") is not False
    return True


def _require_admin_config_enabled() -> None:
    if not _is_admin_config_enabled():
        raise HTTPException(status_code=403, detail="Config admin is disabled")


def _normalize_identity(value: str | None) -> str:
    return " ".join((value or "").strip().split()).lower()


def _runtime_admin_allowlist() -> set[str]:
    runtime = get_runtime_config()
    ui = runtime.get("ui") if isinstance(runtime, dict) else None
    raw = ui.get("adminUserAllowlist") if isinstance(ui, dict) else None
    if not isinstance(raw, list):
        return set()
    return {
        _normalize_identity(value)
        for value in raw
        if isinstance(value, str) and _normalize_identity(value)
    }


def _require_admin_allowlist_user(current_user: User) -> None:
    allowed = {
        _normalize_identity(value)
        for value in settings.CONFIG_ADMIN_ALLOWLIST
        if _normalize_identity(value)
    }
    allowed.update(_runtime_admin_allowlist())
    if not allowed:
        # Safe fallback to avoid locking out the default admin account in dev.
        allowed.add("admin")

    identities = {
        _normalize_identity(current_user.id),
        _normalize_identity(current_user.username),
        _normalize_identity(current_user.full_name),
        _normalize_identity(current_user.email),
    }
    identities = {value for value in identities if value}
    if identities.isdisjoint(allowed):
        raise HTTPException(
            status_code=403,
            detail="You are not authorized for config admin.",
        )


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Could not parse {path.name}") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=500, detail=f"{path.name} must be a JSON object")
    return parsed


def _validate_config_path(path: Path) -> None:
    try:
        resolved = path.resolve()
        config_root = CONFIG_DIR.resolve()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Invalid config path") from exc
    if resolved.parent != config_root:
        raise HTTPException(status_code=500, detail="Refusing to write outside config directory")


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    _validate_config_path(path)
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail=f"{path.name} payload must be a JSON object")
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    try:
        temp_path.write_text(serialized, encoding="utf-8")
        temp_path.replace(path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"Could not write {path.name}. Ensure /config is writable for media_api.",
        ) from exc


@router.get("", response_model=ConfigBundle)
def get_admin_config_bundle(current_user: User = Depends(get_current_user)) -> ConfigBundle:
    _require_admin_config_enabled()
    _require_admin_allowlist_user(current_user)
    return ConfigBundle(
        runtime=_load_json(RUNTIME_CONFIG_PATH),
        questions=_load_json(QUESTIONS_CONFIG_PATH),
        prompts=_load_json(PROMPTS_CONFIG_PATH),
    )


@router.put("", response_model=ConfigBundle)
def update_admin_config_bundle(
    payload: ConfigBundle,
    current_user: User = Depends(get_current_user),
) -> ConfigBundle:
    _require_admin_config_enabled()
    _require_admin_allowlist_user(current_user)

    _write_json(RUNTIME_CONFIG_PATH, payload.runtime)
    _write_json(QUESTIONS_CONFIG_PATH, payload.questions)
    _write_json(PROMPTS_CONFIG_PATH, payload.prompts)
    clear_system_config_cache()

    return ConfigBundle(
        runtime=_load_json(RUNTIME_CONFIG_PATH),
        questions=_load_json(QUESTIONS_CONFIG_PATH),
        prompts=_load_json(PROMPTS_CONFIG_PATH),
    )
