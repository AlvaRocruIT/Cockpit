# Project Reporting Portal

A client-facing project tracking and reporting platform built from a structured Excel workflow.

## Objective

Transform project execution into a transparent reporting experience where clients can:

- Track progress in real time.
- Review weekly milestones.
- Provide task-level feedback.
- Export project reports.
- Receive automated progress updates.

## Core Features

- Sprint-based project tracking.
- Task status management.
- Automatic progress calculations.
- Client feedback system.
- PDF report generation.
- Email notifications.
- Multi-client support.
- Excel-driven project creation.

## Project Structure

- Excel Template → Source of truth
- Figma → UI/UX Design
- React → Frontend
- Supabase → Data persistence
- Codex → Development assistant

## Status Logic

| Status | Description |
|----------|----------|
| Achieved | Task completed |
| In Progress | Work currently underway |
| Delayed | Task behind schedule |
| Upcoming | Task not started yet |

## Progress Calculation

Weekly Progress:
- Equal weight for all tasks within the sprint.
- Only "Achieved" contributes to progress.

Overall Progress:
- Each sprint contributes equally to the project.
- Overall progress is calculated automatically.

## Roles

### Admin
- Manage projects.
- Update task status.
- Generate reports.

### Client
- View project progress.
- Submit feedback.
- Review milestone completion.

## Roadmap

- Foundation
- Core Interface
- Sprint Management
- Reporting & Automation
- Multi-Client Support
- Excel Import System

## License

Private Project
