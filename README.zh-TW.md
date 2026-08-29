# Agent Office

<div align="center">

**讓使用者與 AI Agent 共同協作的 Office 工作區**

[English](README.md) | 繁體中文

</div>

Agent Office 是一套可自行託管的協作工作區，讓使用者與 AI Agent 一起處理 Word 文件、試算表、簡報與 PDF。建立或上傳文件後，只要在聊天室標記 Agent，就能即時查看它在同一份文件中工作，並接收執行進度與結果。

## 主要功能

- **AI 文件編輯**：使用 `@Alice 幫我更新第一段內容` 這類自然語言訊息指派工作。
- **即時協作**：工作區成員會即時收到聊天訊息、任務進度與文件變更。
- **多種 Office 格式**：支援 Word、Excel、PowerPoint、OpenDocument、PDF 與文字檔案。
- **可選擇編輯器**：可搭配 Collabora Online 或 OnlyOffice 使用。
- **工作區專屬 Agent**：分別設定模型、憑證、提示詞、技能與 MCP 伺服器。
- **自行託管**：帳號、文件及工作區資料皆保留在自己的部署環境。
- **多語系介面**：支援英文與繁體中文。

## 快速開始

### 使用 Docker

1. 複製環境設定檔，並更新其中的憑證：

```bash
cp .env.example .env
```

2. 選擇要使用的 Office 編輯器並啟動服務：

```bash
# Collabora Online
docker compose -f docker-compose.yml -f docker-compose.collabora.yml up -d

# OnlyOffice
docker compose -f docker-compose.yml -f docker-compose.onlyoffice.yml up -d
```

3. 開啟 [http://localhost:8788](http://localhost:8788)，註冊帳號並建立第一個工作區。

## 啟用 AI Agent

在 `.env` 設定模型供應商的憑證：

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
```

只需要填寫預計使用的模型供應商。Claude 訂閱權杖也可透過 `CLAUDE_CODE_OAUTH_TOKEN` 設定。

接著進入工作區的 **Agents** 頁面建立 Agent，選擇供應商、模型、提示詞、技能與憑證。工作區中的 Agent 設定會優先於部署環境的預設值。

開啟文件後，即可從聊天室指派工作：

```text
@Alice 把第一段的日期改成 2026 年 8 月，並在結尾加上一句致謝。
```

輸入 `@` 會顯示已啟用的 Agent。選定的 Agent 會在自己的瀏覽器工作階段開啟文件、完成編輯與儲存，最後在聊天室回報結果。

## 本機開發

啟動後端：

```bash
cd backend/AgentOffice.API
dotnet run
```

在另一個終端機啟動前端：

```bash
cd frontend
npm install
npm run dev
```

前端位於 [http://localhost:5173](http://localhost:5173)，API 位於 `http://localhost:5000`。

## 支援的 AI 供應商

- Anthropic
- OpenAI 與 OpenAI Codex
- Google AI
- AWS Bedrock
- Google Vertex AI
- OpenRouter
- 其他內建 pi runtime 支援的供應商

## 相關文件

- [架構與安全邊界](docs/ARCHITECTURE.md)
- [已知問題](docs/KNOWN-ISSUES.md)

## 專案目錄

- `frontend/`：網頁介面
- `backend/`：API、身分驗證、工作區、文件與 WOPI 主機
- `agent-worker/`：AI 任務執行器及瀏覽器 Office 工具
- `docs/`：架構及操作說明

## 多語系

介面支援英文與繁體中文，並會自動記住使用者選擇。翻譯檔案位於 `frontend/src/locales/`。
