from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(
    title="Cockpit Backend",
    version="0.1.0",
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


@app.post("/projects")
def receive_project(project: ProjectRequest) -> dict[str, object]:
    return {
        "message": "Project received successfully",
        "project": project.model_dump(),
    }
