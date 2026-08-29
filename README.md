# Agent Office

<div align="center">

**A collaborative Office workspace for people and AI agents**

English | [繁體中文](README.zh-TW.md)

</div>

Agent Office is a self-hosted workspace where people and AI agents can collaborate on Word documents, spreadsheets, presentations, and PDFs. Upload or create a document, mention an agent in chat, and watch it work in the same file while progress streams back in real time.

## Features

- **AI-assisted document editing** — assign work with natural-language messages such as `@Alice update the first paragraph`.
- **Real-time collaboration** — chat, task progress, and document changes update live for workspace members.
- **Office file support** — work with Word, Excel, PowerPoint, OpenDocument, PDF, and text files.
- **Flexible editor backend** — run with Collabora Online or OnlyOffice.
- **Workspace agents** — configure different models, credentials, prompts, skills, and MCP servers per workspace.
- **Self-hosted** — keep accounts, documents, and workspace data in your own deployment.
- **English and Traditional Chinese** — switch languages from the sign-in page or sidebar.

## Getting Started

### Run with Docker

1. Copy the environment file and update its credentials:

```bash
cp .env.example .env
```

2. Start Agent Office with your preferred editor:

```bash
# Collabora Online
docker compose -f docker-compose.yml -f docker-compose.collabora.yml up -d

# OnlyOffice
docker compose -f docker-compose.yml -f docker-compose.onlyoffice.yml up -d
```

3. Open [http://localhost:8788](http://localhost:8788), create an account, and create your first workspace.

## Enable an AI Agent

Set a model credential in `.env`:

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

You only need the credential for the provider you plan to use. Claude subscription tokens are also supported through `CLAUDE_CODE_OAUTH_TOKEN`.

You can then create an agent from the workspace **Agents** page and choose its provider, model, prompt, skills, and credentials. Workspace settings take precedence over deployment defaults.

Open a document and assign work from its chat panel:

```text
@Alice Change the date in the first paragraph to August 2026 and add a thank-you sentence at the end.
```

Typing `@` opens a list of enabled agents. The selected agent opens the document in its own browser session, edits it, saves it, and reports the result in chat.

## Local Development

Start the backend:

```bash
cd backend/AgentOffice.API
dotnet run
```

Start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend is available at [http://localhost:5173](http://localhost:5173), and the API runs at `http://localhost:5000`.

## Supported AI Providers

- Anthropic
- OpenAI and OpenAI Codex
- Google AI
- AWS Bedrock
- Google Vertex AI
- OpenRouter
- Other providers supported by the built-in pi runtime

## Documentation

- [Architecture and security boundaries](docs/ARCHITECTURE.md)
- [Known issues](docs/KNOWN-ISSUES.md)

## Project Layout

- `frontend/` — web interface
- `backend/` — API, authentication, workspaces, documents, and WOPI host
- `agent-worker/` — AI task runner and browser-based Office tools
- `docs/` — architecture and operational notes

## Internationalization

The interface supports English and Traditional Chinese. Language selection is remembered automatically. Translation files are located in `frontend/src/locales/`.
