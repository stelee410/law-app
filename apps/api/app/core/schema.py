from app.core.database import Database


def initialize_schema(database: Database) -> None:
  statements = [
    """
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS otp_codes (
      phone TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      debtor_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      contract_date TEXT NOT NULL,
      dispute TEXT NOT NULL,
      due_status TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      case_no TEXT NOT NULL,
      selected_plan TEXT,
      assessment_json JSONB,
      stages_json JSONB NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS evidence_files (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS assessment_jobs (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      result_json JSONB,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS case_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_cases_user_created ON cases(user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence_files(case_id)",
    "CREATE INDEX IF NOT EXISTS idx_events_case_created ON case_events(case_id, created_at)",
  ]
  with database.connection() as conn:
    with conn.cursor() as cursor:
      for statement in statements:
        cursor.execute(statement)
    conn.commit()
