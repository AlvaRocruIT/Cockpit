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
    week: int = 0
      
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


@app.get("/project-status/{project}")
def get_project_status(project: str):
    try:
        data = (
            supabase
            .table("Project_status")
            .select("*")
            .eq("project", project)
            .order("milestone_order").order("task_order")
            .execute()
        )

        return {
            "records": data.data
        }

    except Exception as e:
        return {"error": str(e)}

@app.get("/communications/{project}/{task}")
def get_communications(project: str, task: str):
    try:
        data = supabase.table("Communications_table").select("*").eq("project", project).eq("task", task).order("created_at").execute()
        return {"messages": data.data}
    except Exception as e:
        return {"error": str(e)}
          
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
            .upsert(project.model_dump())
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
            .upsert(
                item.model_dump(),
                on_conflict="client,project,milestone,task"
            )
            .execute()
        )

        return {
            "message": "Project status saved successfully",
            "data": data.data,
        }

    except Exception as e:
        return {"error": str(e)}

class CommunicationRequest(BaseModel):
    type: str = "feedback"
    message: str
    email: str
    client: str
    project: str
    task: str
    sender_role: str

@app.post("/communications")
def post_communication(item: CommunicationRequest):
    try:
        data = supabase.table("Communications_table").insert(item.model_dump()).execute()
        return {"message": "Saved", "data": data.data}
    except Exception as e:
        return {"error": str(e)}

