import os
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field
from supabase import create_client

app = FastAPI(
    title="Cockpit Backend",
    version="0.1.0",
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY
)

class ProjectRequest(BaseModel):
    name: str = Field(min_length=1)
    client: str = Field(min_length=1)
    condition: Literal["active", "paused", "cancelled", "completed"]
    week: int = Field(ge=1)
    total_weeks: int = Field(ge=1)

@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Cockpit backend is running"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/test-db")
def test_db():
    data = supabase.table("Projects_table").select("*").limit(1).execute()
    return data.data

@app.post("/projects")
def receive_project(project: ProjectRequest) -> dict[str, object]:
    return {
        "message": "Project received successfully",
        "project": project.model_dump(),
    }
