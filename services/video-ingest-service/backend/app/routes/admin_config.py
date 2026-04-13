import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.models import User
from app.routes.accounts import get_current_user
from app.system_config import (
    CONFIG_DIR,
    DEV_QUESTIONS_CONFIG_PATH,
    PROMPTS_CONFIG_PATH,
    QUESTIONS_CONFIG_PATH,
    RUNTIME_CONFIG_PATH,
    SIGNAL_SCHEMAS_CONFIG_PATH,
    clear_system_config_cache,
    get_runtime_config,
)

router = APIRouter(prefix="/accounts/admin/config", tags=["admin-config"])


class ConfigBundle(BaseModel):
    runtime: dict[str, Any]
    questions: dict[str, Any]
    dev_questions: dict[str, Any] = Field(default_factory=dict)
    prompts: dict[str, Any]
    signal_schemas: dict[str, Any] = Field(default_factory=dict)
    active_question_set: str | None = None


def _normalize_question_set(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    return "dev" if normalized in {"dev", "development"} else "default"


def _extract_active_question_set(runtime: dict[str, Any] | None) -> str:
    ui = runtime.get("ui") if isinstance(runtime, dict) else None
    selected = ui.get("activeQuestionSet") if isinstance(ui, dict) else None
    return _normalize_question_set(selected)


def _runtime_with_active_question_set(
    runtime: dict[str, Any],
    selected_question_set: str,
) -> dict[str, Any]:
    next_runtime = dict(runtime)
    ui = next_runtime.get("ui")
    ui_dict = dict(ui) if isinstance(ui, dict) else {}
    ui_dict["activeQuestionSet"] = _normalize_question_set(selected_question_set)
    next_runtime["ui"] = ui_dict
    return next_runtime


def _is_admin_config_enabled() -> bool:
    if settings.CONFIG_ADMIN_ENABLED:
        return True
    runtime = get_runtime_config()
    ui = runtime.get("ui") if isinstance(runtime, dict) else None
    if isinstance(ui, dict):
        explicit = ui.get("enableConfigAdmin")
        if isinstance(explicit, bool):
            return explicit
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


def _iter_question_entries(questions_config: dict[str, Any]) -> list[dict[str, Any]]:
    questions_root = questions_config.get("questions")
    if not isinstance(questions_root, dict):
        return []
    entries: list[dict[str, Any]] = []
    for section_value in questions_root.values():
        if not isinstance(section_value, dict):
            continue
        variants = section_value.get("variants")
        if not isinstance(variants, list):
            continue
        for variant in variants:
            if not isinstance(variant, dict):
                continue
            questions = variant.get("questions")
            if not isinstance(questions, list):
                continue
            for question in questions:
                if isinstance(question, dict):
                    entries.append(question)
    return entries


def _validate_prompt_and_schema_refs(
    questions_config: dict[str, Any],
    dev_questions_config: dict[str, Any],
    prompts_config: dict[str, Any],
    signal_schemas_config: dict[str, Any],
) -> None:
    known_prompt_keys = {
        key.strip()
        for key, value in prompts_config.items()
        if isinstance(key, str) and key.strip() and isinstance(value, dict)
    }
    known_schema_keys = {
        key.strip()
        for key, value in signal_schemas_config.items()
        if isinstance(key, str) and key.strip() and isinstance(value, dict)
    }
    missing_prompt_keys: set[str] = set()
    missing_schema_keys: set[str] = set()
    questions_missing_extractors: set[str] = set()
    extractors_missing_signal_key: set[str] = set()

    for question in [*_iter_question_entries(questions_config), *_iter_question_entries(dev_questions_config)]:
        question_id = question.get("id")
        question_name = question_id.strip() if isinstance(question_id, str) and question_id.strip() else "<unknown>"
        extractors = question.get("extractors")
        if not isinstance(extractors, list) or not extractors:
            questions_missing_extractors.add(question_name)
            continue
        for index, extractor in enumerate(extractors):
            if not isinstance(extractor, dict):
                extractors_missing_signal_key.add(f"{question_name}[{index}]")
                continue
            signal_key = extractor.get("signal_key")
            if not isinstance(signal_key, str) or not signal_key.strip():
                extractors_missing_signal_key.add(f"{question_name}[{index}]")
            extractor_prompt_key = extractor.get("prompt_key")
            if (
                isinstance(extractor_prompt_key, str)
                and extractor_prompt_key.strip()
                and extractor_prompt_key.strip() not in known_prompt_keys
            ):
                missing_prompt_keys.add(extractor_prompt_key.strip())
            extractor_schema_key = extractor.get("schema_key")
            if (
                isinstance(extractor_schema_key, str)
                and extractor_schema_key.strip()
                and extractor_schema_key.strip() not in known_schema_keys
            ):
                missing_schema_keys.add(extractor_schema_key.strip())

    for prompt_value in prompts_config.values():
        if not isinstance(prompt_value, dict):
            continue
        schema_key = prompt_value.get("schema_key")
        if isinstance(schema_key, str) and schema_key.strip() and schema_key.strip() not in known_schema_keys:
            missing_schema_keys.add(schema_key.strip())

    issues: list[str] = []
    if questions_missing_extractors:
        issues.append(
            "Questions missing non-empty extractors: "
            + ", ".join(sorted(questions_missing_extractors))
        )
    if extractors_missing_signal_key:
        issues.append(
            "Extractors missing signal_key: "
            + ", ".join(sorted(extractors_missing_signal_key))
        )
    if missing_prompt_keys:
        issues.append(f"Unknown prompt_key(s): {', '.join(sorted(missing_prompt_keys))}")
    if missing_schema_keys:
        issues.append(f"Unknown schema_key(s): {', '.join(sorted(missing_schema_keys))}")
    if issues:
        raise HTTPException(status_code=400, detail="; ".join(issues))


@router.get("", response_model=ConfigBundle)
def get_admin_config_bundle(current_user: User = Depends(get_current_user)) -> ConfigBundle:
    _require_admin_config_enabled()
    _require_admin_allowlist_user(current_user)
    runtime = _load_json(RUNTIME_CONFIG_PATH)
    return ConfigBundle(
        runtime=runtime,
        questions=_load_json(QUESTIONS_CONFIG_PATH),
        dev_questions=_load_json(DEV_QUESTIONS_CONFIG_PATH),
        prompts=_load_json(PROMPTS_CONFIG_PATH),
        signal_schemas=_load_json(SIGNAL_SCHEMAS_CONFIG_PATH),
        active_question_set=_extract_active_question_set(runtime),
    )


@router.put("", response_model=ConfigBundle)
def update_admin_config_bundle(
    payload: ConfigBundle,
    current_user: User = Depends(get_current_user),
) -> ConfigBundle:
    _require_admin_config_enabled()
    _require_admin_allowlist_user(current_user)
    selected_question_set = _normalize_question_set(
        payload.active_question_set or _extract_active_question_set(payload.runtime)
    )
    _validate_prompt_and_schema_refs(
        payload.questions,
        payload.dev_questions,
        payload.prompts,
        payload.signal_schemas,
    )
    runtime_payload = _runtime_with_active_question_set(payload.runtime, selected_question_set)
    _write_json(RUNTIME_CONFIG_PATH, runtime_payload)
    _write_json(QUESTIONS_CONFIG_PATH, payload.questions)
    _write_json(DEV_QUESTIONS_CONFIG_PATH, payload.dev_questions)
    _write_json(PROMPTS_CONFIG_PATH, payload.prompts)
    _write_json(SIGNAL_SCHEMAS_CONFIG_PATH, payload.signal_schemas)
    clear_system_config_cache()
    runtime = _load_json(RUNTIME_CONFIG_PATH)
    return ConfigBundle(
        runtime=runtime,
        questions=_load_json(QUESTIONS_CONFIG_PATH),
        dev_questions=_load_json(DEV_QUESTIONS_CONFIG_PATH),
        prompts=_load_json(PROMPTS_CONFIG_PATH),
        signal_schemas=_load_json(SIGNAL_SCHEMAS_CONFIG_PATH),
        active_question_set=_extract_active_question_set(runtime),
    )
