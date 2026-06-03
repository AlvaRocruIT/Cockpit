import os
from typing import Literal
from fastapi import FastAPI
from pydantic import BaseModel, Field
from supabase import create_client
from fastapi.middleware.cors import CORSMiddleware

      
app = FastAPI(
    title="Cockpit Backend",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://alvarocruit.github.io",
        "https://cockpit-hjwq.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY
)

class ProjectRequest(BaseModel):
    project: str = Field(min_length=1)
    client: str = Field(min_length=1)
    condition: Literal["active", "paused", "cancelled", "completed"]
    week: int = Field(ge=1)
    total_weeks: int = Field(ge=1)

class ProjectStatusRequest(BaseModel):
    milestone: str
    task: str
    status: str
    feedback: str | None = None
    retry_required: bool = False
    client: str
    project: str
      
@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Cockpit backend is running"}

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

@app.get("/projects")
def get_projects():
    try:
        data = (
            supabase
            .table("Projects_table")
            .select("id, client, project, condition, week, total_weeks, created_at")
            .order("created_at", desc=True)
            .execute()
        )

        return {
            "projects": data.data
        }

    except Exception as e:
        return {
            "error": str(e)
        }
          
@app.post("/projects")
def receive_project(project: ProjectRequest):
    try:
        existing_client = (
            supabase
            .table("clients")
            .select("id")
            .eq("client_name", project.client)
            .limit(1)
            .execute()
        )

        if not existing_client.data:
            (
                supabase
                .table("clients")
                .insert({
                    "client_name": project.client,
                    "email": f"{project.client.lower().replace(' ', '_')}@pending.local"
                })
                .execute()
            )

        data = (
            supabase
            .table("Projects_table")
            .insert(project.model_dump())
            .execute()
        )

        return {
            "message": "Project saved successfully",
            "data": data.data,
        }

    except Exception as e:
        return {"error": str(e)}

@app.post("/project-status")
def receive_project_status(item: ProjectStatusRequest):
    try:
        data = (
            supabase
            .table("Project_status")
            .insert(item.model_dump())
            .execute()
        )

        return {
            "message": "Project status saved successfully",
            "data": data.data,
        }

    except Exception as e:
        return {"error": str(e)}
