# Jev Bridge

Shared local access to TypeSafe Jev for Codex, local-model harnesses and a ChatGPT MCP connection.

## What it does

- Exposes four local MCP tools over stdio: `jev_yes_no`, `jev_choice`, `jev_score`, and `jev_models`.
- Exposes an optional loopback-only JSON API at `127.0.0.1:8789` for local applications that do not speak MCP.
- Keeps the TypeSafe key out of source code. On Windows, `install-windows.ps1` stores it with user-bound DPAPI encryption and injects it only into the child process.
- Sends only the `state` supplied to a Jev call to TypeSafe. Nothing is automatically forwarded from Second Rolf, Bonsai, Codex or ChatGPT.

Jev remains a hosted TypeSafe model. Local models can use this bridge as a tool; the model weights do not run locally.

## Windows setup

Run from this directory in ordinary PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1
```

The installer verifies Node 20+, installs dependencies, runs offline tests, asks for the TypeSafe API key in a hidden prompt, performs one synthetic live Jev call, installs TypeSafe's official agent skill for Codex when Codex is present, backs up `~/.codex/config.toml`, and adds the local Jev MCP server if that entry does not already exist.

Restart Codex, then verify:

```powershell
codex mcp list
```

Ask Codex to use `jev_models`, then make a harmless `jev_yes_no` call with synthetic state.

## Local-model use

Start the loopback API:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-http.ps1
```

Endpoints:

- `GET /health`
- `POST /models`
- `POST /noul` with `{ "state": "...", "question": "..." }`
- `POST /choice` with `{ "state": "...", "question": "...", "options": [{"label":"a"},{"label":"b"}] }`
- `POST /score` with `{ "state": "...", "question": "...", "levels": ["low","high"] }`

The HTTP service binds only to `127.0.0.1`. Do not expose it to the LAN or Internet.

## ChatGPT account connection

An MCP configuration in local Codex does **not** automatically appear in ordinary ChatGPT chats. To use this bridge from ChatGPT, connect the local stdio server through ChatGPT Developer mode and OpenAI Secure MCP Tunnel. The tunnel client should launch:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File <absolute-path-to>\run-jev.ps1
```

Keep the tunnel client running while using the plugin. The TypeSafe key stays on the PC; ChatGPT sends only the arguments for the Jev tool call through the tunnel to this local process.

Current OpenAI docs: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels and https://developers.openai.com/plugins/deploy/connect-chatgpt

## Privacy rule

Jev is a hosted API. Do not send passwords, API keys, patient data, confidential workplace material, or private owner notes. Use narrow state and only the context required for the decision.
