from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from psycopg import Connection
from psycopg_pool import ConnectionPool

from app.core.config import Settings


class Database:
  def __init__(self, settings: Settings):
    self.settings = settings
    self.pool = ConnectionPool(
      conninfo=settings.postgres_dsn,
      min_size=1,
      max_size=settings.POSTGRES_POOL_SIZE + settings.POSTGRES_MAX_OVERFLOW,
      kwargs={"autocommit": False},
      open=False,
    )

  def open(self) -> None:
    self.pool.open()

  def close(self) -> None:
    self.pool.close()

  @contextmanager
  def connection(self) -> Iterator[Connection[Any]]:
    with self.pool.connection() as conn:
      yield conn
