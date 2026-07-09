import json
import logging
from collections.abc import Mapping
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.schemas import AssessmentResult, LawCase

logger = logging.getLogger("uvicorn.error")


def generate_assessment_with_llm(
  settings: Settings,
  law_case: LawCase,
  state: Mapping[str, Any],
) -> AssessmentResult | None:
  api_base = _clean_string(settings.OPENAI_API_BASE)
  api_key = _secret_string(settings.OPENAI_API_KEY)
  model = _clean_string(settings.DEFAULT_LLM_MODEL)
  if api_base is None or api_key is None or model is None:
    logger.info(
      "assessment.llm skipped not_configured case_id=%s case_type=%s base_set=%s key_set=%s model_set=%s",
      law_case.id,
      law_case.caseType,
      api_base is not None,
      api_key is not None,
      model is not None,
    )
    return None

  fallback = state.get("assessment")
  if not isinstance(fallback, AssessmentResult):
    logger.info(
      "assessment.llm skipped missing_deterministic_result case_id=%s case_type=%s model=%s",
      law_case.id,
      law_case.caseType,
      model,
    )
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

  logger.info(
    "assessment.llm call_started case_id=%s case_type=%s model=%s",
    law_case.id,
    law_case.caseType,
    model,
  )
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
      logger.info(
        "assessment.llm call_failed case_id=%s case_type=%s model=%s reason=invalid_response",
        law_case.id,
        law_case.caseType,
        model,
      )
      return None
    result = AssessmentResult.model_validate(
      {
        **llm_payload,
        "plans": fallback.plans,
        "generatedAt": fallback.generatedAt,
      }
    )
    logger.info(
      "assessment.llm call_success case_id=%s case_type=%s model=%s win_rate=%s",
      law_case.id,
      law_case.caseType,
      model,
      result.winRate,
    )
    return result
  except (httpx.HTTPError, json.JSONDecodeError, TypeError, KeyError, ValidationError) as exc:
    logger.info(
      "assessment.llm call_failed case_id=%s case_type=%s model=%s reason=%s",
      law_case.id,
      law_case.caseType,
      model,
      _safe_error_reason(exc),
    )
    return None


def generate_self_service_document_body(
  settings: Settings,
  law_case: LawCase,
  template_body: str,
) -> str | None:
  api_base = _clean_string(settings.OPENAI_API_BASE)
  api_key = _secret_string(settings.OPENAI_API_KEY)
  model = _clean_string(settings.DEFAULT_LLM_MODEL)
  if api_base is None or api_key is None or model is None:
    logger.info(
      "self_service.llm skipped not_configured case_id=%s case_type=%s",
      law_case.id,
      law_case.caseType,
    )
    return None

  payload = {
    "model": model,
    "temperature": settings.DEFAULT_LLM_TEMPERATURE,
    "messages": [
      {
        "role": "system",
        "content": (
          "You are a Chinese legal document drafting assistant. Improve the provided "
          "draft for readability only. Preserve every section heading, every quoted "
          "law name and article number, every legal-basis paragraph, the 399 self-service "
          "boundary notice, and the AI-generated notice exactly. Do not add, remove, "
          "replace, or reorder legal articles. Do not introduce terms from another case "
          "type, such as payment-demand wording in non-debt documents. Return strict "
          'JSON only with a single key "body" containing the improved document text in Chinese.'
        ),
      },
      {
        "role": "user",
        "content": json.dumps(
          {"case": law_case.model_dump(mode="json"), "draftBody": template_body},
          ensure_ascii=False,
        ),
      },
    ],
  }

  logger.info(
    "self_service.llm call_started case_id=%s case_type=%s model=%s",
    law_case.id,
    law_case.caseType,
    model,
  )
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
    body = llm_payload.get("body") if llm_payload is not None else None
    if not isinstance(body, str) or len(body.strip()) < 20:
      logger.info(
        "self_service.llm call_failed case_id=%s case_type=%s model=%s reason=invalid_response",
        law_case.id,
        law_case.caseType,
        model,
      )
      return None
    logger.info(
      "self_service.llm call_success case_id=%s case_type=%s model=%s",
      law_case.id,
      law_case.caseType,
      model,
    )
    return body.strip()
  except (httpx.HTTPError, json.JSONDecodeError, TypeError, KeyError, ValidationError) as exc:
    logger.info(
      "self_service.llm call_failed case_id=%s case_type=%s model=%s reason=%s",
      law_case.id,
      law_case.caseType,
      model,
      _safe_error_reason(exc),
    )
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


def _safe_error_reason(exc: Exception) -> str:
  if isinstance(exc, httpx.HTTPStatusError):
    return f"http_status_{exc.response.status_code}"
  if isinstance(exc, httpx.TimeoutException):
    return "timeout"
  if isinstance(exc, httpx.HTTPError):
    return exc.__class__.__name__
  if isinstance(exc, json.JSONDecodeError):
    return "json_decode_error"
  if isinstance(exc, ValidationError):
    return "validation_error"
  return exc.__class__.__name__
