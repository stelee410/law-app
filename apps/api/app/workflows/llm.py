import json
from collections.abc import Mapping
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas import AssessmentResult, LawCase


def generate_assessment_with_llm(
  settings: Settings,
  law_case: LawCase,
  state: Mapping[str, Any],
) -> AssessmentResult | None:
  api_base = _clean_string(settings.OPENAI_API_BASE)
  api_key = _secret_string(settings.OPENAI_API_KEY)
  model = _clean_string(settings.DEFAULT_LLM_MODEL)
  if api_base is None or api_key is None or model is None:
    return None

  fallback = state.get("assessment")
  if not isinstance(fallback, AssessmentResult):
    return None

  payload = {
    "model": model,
    "temperature": settings.DEFAULT_LLM_TEMPERATURE,
    "messages": [
      {
        "role": "system",
        "content": (
          "You are a legal case assessment assistant. Return strict JSON only "
          "with winRate, confidence, summary, suggestedRoute, estimatedDays, "
          "estimatedRecovery, and findings. confidence must be one of: 中等, 较高, 高."
        ),
      },
      {
        "role": "user",
        "content": json.dumps(
          {
            "case": law_case.model_dump(mode="json"),
            "deterministicAssessment": fallback.model_dump(mode="json", exclude={"plans"}),
            "workflowState": {
              "uploaded_files": state.get("uploaded_files"),
              "required_categories": state.get("required_categories"),
              "covered_required": state.get("covered_required"),
              "evidence_summary": state.get("evidence_summary"),
              "legal_facts": state.get("legal_facts"),
              "risk_score": state.get("risk_score"),
              "recommended_plan_id": state.get("recommended_plan_id"),
            },
          },
          ensure_ascii=False,
        ),
      },
    ],
  }

  try:
    response = httpx.post(
      f"{api_base.rstrip('/')}/chat/completions",
      headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
      },
      json=payload,
      timeout=8.0,
    )
    response.raise_for_status()
    llm_payload = _parse_chat_completion(response.json())
    if llm_payload is None:
      return None
    return AssessmentResult.model_validate(
      {
        **llm_payload,
        "plans": fallback.plans,
        "generatedAt": fallback.generatedAt,
      }
    )
  except (httpx.HTTPError, json.JSONDecodeError, TypeError, KeyError, ValidationError):
    return None


def _parse_chat_completion(payload: Mapping[str, Any]) -> dict[str, Any] | None:
  choices = payload.get("choices")
  if not isinstance(choices, list) or not choices:
    return None
  first_choice = choices[0]
  if not isinstance(first_choice, Mapping):
    return None
  message = first_choice.get("message")
  if not isinstance(message, Mapping):
    return None
  content = message.get("content")
  if not isinstance(content, str):
    return None
  parsed = json.loads(content)
  return parsed if isinstance(parsed, dict) else None


def _secret_string(value: Any) -> str | None:
  if value is None:
    return None
  if hasattr(value, "get_secret_value"):
    value = value.get_secret_value()
  return _clean_string(str(value))


def _clean_string(value: str | None) -> str | None:
  if value is None:
    return None
  stripped = value.strip()
  return stripped or None
