import base64
import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime
from secrets import randbelow
from urllib.parse import quote
from uuid import uuid4

import httpx

from app.core.config import Settings

logger = logging.getLogger("uvicorn.error")


class SmsNotConfiguredError(Exception):
  pass


class SmsTemplateMissingError(Exception):
  pass


class SmsProviderError(Exception):
  pass


def send_verification_code(settings: Settings, phone: str, purpose: str) -> str:
  if not settings.SMS_ENABLED:
    raise SmsNotConfiguredError("SMS_NOT_CONFIGURED")
  if purpose not in ("login", "register"):
    raise SmsTemplateMissingError("SMS_TEMPLATE_MISSING")

  if settings.SMS_PROVIDER == "mock":
    return settings.MOCK_OTP_CODE

  code = _generate_numeric_code(settings.SMS_CODE_LENGTH)
  if settings.SMS_PROVIDER == "log":
    logger.info("sms.verification_code phone=%s purpose=%s code=%s", phone, purpose, code)
    return code

  _send_with_aliyun(settings, phone, purpose, code)
  return code


def _send_with_aliyun(settings: Settings, phone: str, purpose: str, code: str) -> None:
  secret = settings.ALIYUN_SMS_ACCESS_KEY_SECRET.get_secret_value() if settings.ALIYUN_SMS_ACCESS_KEY_SECRET else ""
  template = settings.ALIYUN_SMS_TEMPLATE_LOGIN if purpose == "login" else settings.ALIYUN_SMS_TEMPLATE_REGISTER
  if not settings.ALIYUN_SMS_ACCESS_KEY_ID or not secret or not settings.ALIYUN_SMS_SIGN_NAME:
    raise SmsNotConfiguredError("SMS_NOT_CONFIGURED")
  if not template:
    raise SmsTemplateMissingError("SMS_TEMPLATE_MISSING")

  params = {
    "AccessKeyId": settings.ALIYUN_SMS_ACCESS_KEY_ID,
    "Action": "SendSms",
    "Format": "JSON",
    "PhoneNumbers": phone,
    "RegionId": settings.ALIYUN_SMS_REGION_ID,
    "SignName": settings.ALIYUN_SMS_SIGN_NAME,
    "SignatureMethod": "HMAC-SHA1",
    "SignatureNonce": uuid4().hex,
    "SignatureVersion": "1.0",
    "TemplateCode": template,
    "TemplateParam": json.dumps(
      {settings.ALIYUN_SMS_TEMPLATE_CODE_PARAM: code},
      separators=(",", ":"),
      ensure_ascii=False,
    ),
    "Timestamp": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "Version": "2017-05-25",
  }
  params["Signature"] = _aliyun_rpc_signature("GET", params, secret)
  endpoint = settings.ALIYUN_SMS_ENDPOINT.strip().rstrip("/") or "https://dysmsapi.aliyuncs.com"
  if not endpoint.startswith(("http://", "https://")):
    endpoint = f"https://{endpoint}"

  try:
    response = httpx.get(
      f"{endpoint}/?{_encode_aliyun_rpc_params(params)}",
      timeout=settings.ALIYUN_SMS_REQUEST_TIMEOUT_SECONDS,
    )
    payload = response.json()
  except (httpx.HTTPError, ValueError) as exc:
    logger.warning("sms.aliyun request_failed purpose=%s error=%s", purpose, exc.__class__.__name__)
    raise SmsProviderError("SMS_PROVIDER_ERROR") from exc

  if response.status_code >= 400 or payload.get("Code") != "OK":
    provider_code = str(payload.get("Code", "UNKNOWN"))
    logger.warning(
      "sms.aliyun rejected purpose=%s status=%s code=%s request_id=%s",
      purpose,
      response.status_code,
      provider_code,
      payload.get("RequestId", ""),
    )
    if provider_code in ("isv.SMS_TEMPLATE_ILLEGAL", "isv.SMS_SIGN_ILLEGAL"):
      raise SmsTemplateMissingError("SMS_TEMPLATE_MISSING")
    raise SmsProviderError("SMS_PROVIDER_ERROR")


def _generate_numeric_code(length: int) -> str:
  if length < 4 or length > 8:
    raise SmsNotConfiguredError("SMS_NOT_CONFIGURED")
  return "".join(str(randbelow(10)) for _ in range(length))


def _aliyun_rpc_signature(method: str, params: dict[str, str], secret: str) -> str:
  canonical = _encode_aliyun_rpc_params(params)
  string_to_sign = f"{method.upper()}&%2F&{_aliyun_percent_encode(canonical)}"
  digest = hmac.new(f"{secret}&".encode(), string_to_sign.encode(), hashlib.sha1).digest()
  return base64.b64encode(digest).decode()


def _encode_aliyun_rpc_params(params: dict[str, str]) -> str:
  return "&".join(
    f"{_aliyun_percent_encode(key)}={_aliyun_percent_encode(params[key])}"
    for key in sorted(params)
  )


def _aliyun_percent_encode(value: str) -> str:
  return quote(str(value), safe="~")
