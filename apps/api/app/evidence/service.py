from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.schemas import EvidenceFile
from app.store import AppStore

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
UPLOAD_READ_CHUNK_BYTES = 1024 * 1024
ALLOWED_UPLOAD_EXTENSIONS = {
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".txt",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
}
ALLOWED_UPLOAD_MIME_TYPES = {
  "application/msword",
  "application/octet-stream",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
}


class EvidenceUploadError(Exception):
  def __init__(self, status_code: int, detail: str):
    super().__init__(detail)
    self.status_code = status_code
    self.detail = detail


async def upload_evidence(
  store: AppStore,
  user_id: str,
  case_id: str,
  category_id: str,
  file: UploadFile,
) -> EvidenceFile | None:
  law_case = store.get_case(user_id, case_id)
  if law_case is None:
    return None
  category = next((item for item in law_case.evidence if item.id == category_id), None)
  if category is None:
    return None

  file_name = Path(file.filename or "upload.bin").name
  mime_type = _normalize_mime_type(file.content_type)
  if not _is_allowed_file_type(file_name, mime_type):
    raise EvidenceUploadError(400, "UNSUPPORTED_FILE_TYPE")

  content = await _read_limited_upload(file)
  upload_root = Path(store.settings.UPLOAD_DIR).resolve()
  target_dir = upload_root / law_case.id / category.id
  target_dir.mkdir(parents=True, exist_ok=True)
  target_path = target_dir / _storage_file_name(file_name)
  target_path.write_bytes(content)
  storage_path = str(target_path.relative_to(upload_root))

  evidence_file = store.add_evidence_file(
    user_id,
    case_id,
    category_id,
    file_name,
    len(content),
    mime_type,
    storage_path,
  )
  if evidence_file is None:
    target_path.unlink(missing_ok=True)
  return evidence_file


async def _read_limited_upload(file: UploadFile) -> bytes:
  content = bytearray()
  while True:
    chunk = await file.read(UPLOAD_READ_CHUNK_BYTES)
    if not chunk:
      break
    content.extend(chunk)
    if len(content) > MAX_UPLOAD_BYTES:
      raise EvidenceUploadError(413, "FILE_TOO_LARGE")
  return bytes(content)


def _is_allowed_file_type(file_name: str, mime_type: str) -> bool:
  suffix = Path(file_name).suffix.lower()
  return suffix in ALLOWED_UPLOAD_EXTENSIONS and mime_type in ALLOWED_UPLOAD_MIME_TYPES


def _normalize_mime_type(mime_type: str | None) -> str:
  return (mime_type or "application/octet-stream").split(";", 1)[0].strip().lower()


def _storage_file_name(file_name: str) -> str:
  suffix = Path(file_name).suffix.lower()
  return f"{uuid4().hex}{suffix}"
