# 🌌 Superluminal / Nebula IDE (Antigravity Project)

> **⚠️ IMPORTANT NOTICE: PROJECT STATUS**
> This project is started but there will not be anymore updates. New things, product updates, and everything is currently stopped because of some considerable reasons.

---

## 📖 What is this?

**Superluminal (branded as Nebula IDE)** is a custom, AI-powered code editor built to provide an integrated agentic workflow similar to tools like Cursor or Windsurf. The project consists of three main components working together:

1. **Nebula IDE (`vscode/`)**: A heavily customized fork of Microsoft's VS Code (`code-oss`). It serves as the main editor shell.
2. **AI Assistant (`cline-source/`)**: A fork of the powerful **Cline** extension that runs inside Nebula IDE. It handles autonomous coding, terminal execution, and browser interaction using your preferred AI models.
3. **Backend Server (`nebula-backend/`)**: A Node.js/Express server that handles user authentication, subscription plans, telemetry, and serves the landing page.

## ✨ Features

- **Built-in AI Assistant**: Native integration with the Cline AI agent.
- **Custom Agent Sessions Layer**: A dedicated workbench layer for AI workflows.
- **Anthropic Sandbox Runtime**: Safe execution environment for AI operations.
- **Bundled Essentials**: Comes pre-packaged with GitLens, Bookmarks, Prettier, Live Server, and custom themes (Theme 2026).
- **Open VSX Registry**: Uses the open-source extension registry instead of the proprietary Microsoft Marketplace.
- **Telemetry Disabled**: Core IDE telemetry is stripped out for privacy.

---

## 🛠️ How it Works & Architecture

### 1. The IDE (Nebula IDE / Superluminal)
The editor is built on Electron (v39.8.0) and TypeScript (v6.0.0-dev). It removes Microsoft branding, changes the URL protocol to `superluminal://`, and bundles essential tools out of the box.

### 2. The Brain (Cline Extension)
The AI agent runs as an extension within the IDE. It communicates with 40+ LLM providers (Anthropic, OpenAI, OpenRouter, Google, etc.) and uses the Model Context Protocol (MCP) to interact with your codebase, terminal, and browser.

### 3. The Cloud (Antigravity Backend)
The backend uses **Express** and **SQLite** (Better-SQLite3 in WAL mode). It provides JWT-based OAuth authentication (Google, GitHub, Discord, Apple, Microsoft) and manages user subscriptions.

---

## 🚀 Getting Started

If you wish to run or explore the code locally, here is the setup for each component:

### Setting up the Backend
1. Navigate to the backend directory:
   ```bash
   cd nebula-backend
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Fill in your OAuth credentials and AI API keys in the `.env` file.
4. Install dependencies and run:
   ```bash
   npm install
   npm run dev
   ```
   The server will start at `http://localhost:3500`.

### Building Nebula IDE
1. Navigate to the IDE directory:
   ```bash
   cd vscode
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the Electron app (Requires Python, C++ Build Tools, and Node.js 22+):
   ```bash
   npm run gulp compile
   npm run electron
   ```

### Building the Cline Extension
1. Navigate to the extension directory:
   ```bash
   cd cline-source
   ```
2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

---

## 🧩 Known Issues (Historical)
- **Startup ESM Bug**: `Nebula IDE.exe` previously crashed on launch due to an Electron `Menu` export issue (now patched).
- **Branding Variations**: You may see the names "Superluminal", "Nebula IDE", and "Antigravity" used interchangeably across the codebase.

---

*This repository remains as an archive of the work completed up to this point.*
