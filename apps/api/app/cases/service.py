from app.schemas import CreateCaseInput, LawCase, PlanId
from app.store import InMemoryStore


def list_cases(store: InMemoryStore, user_id: str) -> list[LawCase]:
  return store.list_cases(user_id)


def create_case(store: InMemoryStore, user_id: str, payload: CreateCaseInput) -> LawCase:
  return store.create_case(user_id, payload)


def get_case(store: InMemoryStore, user_id: str, case_id: str) -> LawCase | None:
  return store.get_case(user_id, case_id)


def select_plan(store: InMemoryStore, user_id: str, case_id: str, plan_id: PlanId) -> LawCase | None:
  return store.select_plan(user_id, case_id, plan_id)
