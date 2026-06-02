import logging
import os
from contextlib import asynccontextmanager
from hmac import compare_digest
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from supabase import Client, create_client

logger = logging.getLogger("cockpit.backend")

PROJECTS_TABLE = "Projects_table"


def require_env(name: str, *, fallback: str | None = None) -> str:
    value = os.getenv(name) or (os.getenv(fallback) if fallback else None)

    if not value or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")

    return value.strip()


def allowed_origins() -> list[str]:
    raw_value = os.getenv("COCKPIT_ALLOWED_ORIGINS", "")
    origins = [origin.strip() for origin in raw_value.split(",") if origin.strip()]

    if "*" in origins:
        raise RuntimeError(
            "COCKPIT_ALLOWED_ORIGINS must list explicit origins; wildcard access is disabled."
        )

    return origins


@asynccontextmanager
async def lifespan(app: FastAPI):
    supabase_url = require_env("SUPABASE_URL")
    supabase_key = require_env("SUPABASE_SECRET_KEY", fallback="SUPABASE_KEY")
    require_env("COCKPIT_API_KEY")

    app.state.supabase = create_client(supabase_url, supabase_key)
    logger.info("Cockpit backend initialized.")

    yield

    app.state.supabase = None
    logger.info("Cockpit backend stopped.")


app = FastAPI(
    title="Cockpit Backend",
    version="0.2.0",
    lifespan=lifespan,
)

origins = allowed_origins()

if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )


class ProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    client: str = Field(min_length=1, max_length=200)
    condition: Literal["active", "paused", "cancelled", "completed"]
    week: int = Field(ge=1)
    total_weeks: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_week_range(self):
        if self.week > self.total_weeks:
            raise ValueError("week must not exceed total_weeks")

        return self


def get_supabase(request: Request) -> Client:
    client = getattr(request.app.state, "supabase", None)

    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service is unavailable.",
        )

    return client


def require_api_key(
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    expected_key = require_env("COCKPIT_API_KEY")

    if x_api_key is None or not compare_digest(x_api_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key.",
        )


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Cockpit backend is running"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def readiness(
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict[str, str]:
    try:
        supabase.table(PROJECTS_TABLE).select("*").limit(1).execute()
    except Exception:
        logger.exception("Database readiness probe failed.")

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service is unavailable.",
        )

    return {"status": "ready"}


@app.post(
    "/projects",
    dependencies=[Depends(require_api_key)],
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    project: ProjectRequest,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict[str, object]:
    payload = project.model_dump()

    try:
        response = supabase.table(PROJECTS_TABLE).insert(payload).execute()
    except Exception:
        logger.exception("Project insertion failed.")

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Project could not be saved.",
        )

    return {
        "message": "Project created successfully.",
        "project": payload,
        "database_record": response.data,
    }
