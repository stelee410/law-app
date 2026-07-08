from collections.abc import AsyncIterator

from app.schemas import CaseEvent
from app.store import AppStore


def stream_case_events(store: AppStore, user_id: str, case_id: str) -> AsyncIterator[CaseEvent] | None:
  if store.get_case(user_id, case_id) is None:
    return None
  return store.stream_case_events(case_id)


async def to_sse(events: AsyncIterator[CaseEvent]) -> AsyncIterator[str]:
  async for event in events:
    yield f"event: {event.type}\n"
    yield f"data: {event.model_dump_json()}\n\n"
