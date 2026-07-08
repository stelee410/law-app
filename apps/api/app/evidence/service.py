from fastapi import UploadFile

from app.schemas import EvidenceFile
from app.store import InMemoryStore


async def upload_evidence(
  store: InMemoryStore,
  user_id: str,
  case_id: str,
  category_id: str,
  file: UploadFile,
) -> EvidenceFile | None:
  content = await file.read()
  return store.add_evidence_file(
    user_id,
    case_id,
    category_id,
    file.filename or "upload.bin",
    len(content),
    file.content_type or "application/octet-stream",
  )
