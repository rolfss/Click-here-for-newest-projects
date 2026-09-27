# Second Rolf - local AI

Second Rolf uses **PrismML Bonsai 2 27B (PQ2_0)** on Rolf's own Windows PC for general chat and questions about his public professional profile. The pinned model alias is `Bonsai-2-27B-PQ2_0`. The runtime is PrismML llama.cpp release `prism-b10683-d8f26ee`, Windows CUDA 12.4. There is no cloud-model fallback.

The public facts in `site/second-rolf/knowledge.js` are shared by offline profile mode and the model's system context. Bounded conversation history supports follow-ups. Source IDs resolve to published projects. Private owner notes are excluded from public model context, frontend assets and this repository; see [INTERVIEW.md](./INTERVIEW.md).

The workstation has an NVIDIA RTX 5070 Ti (16 GB VRAM), AMD Ryzen 7 9800X3D and 32 GB RAM. The September 19 local setup test loaded all 65/65 layers on the GPU with an 8,192-token context, increasing VRAM usage by approximately 8.27 GiB. One short warmed Norwegian response generated approximately 79 tokens/second. In September 20 application tests, six bounded structured controls using the selected settings generated about 77 tokens/second and completed in about 1.2–1.9 seconds. These are small local measurements, not a comparative benchmark or public latency guarantee.

Public application requests disable thinking and use [PrismML's recommended non-thinking settings](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf#best-practices): temperature 0.7, top-p 0.8, top-k 20, min-p 0, presence penalty 1.5 and repetition penalty 1. These settings avoided the repeated-output behavior observed with the initial low-temperature configuration in the bounded evaluation. They do not guarantee that every answer is correct or repetition-free. The local browser chat may use different server defaults; the application supplies its own settings on every request.

## Connection

```text
GitHub Pages → verification + rate limit → Cloudflare Worker / Durable Object
                                                       ↕ authenticated outbound WSS
                                      local connector → loopback llama-server → GPU
```

The PC opens the connection to Cloudflare. It needs no public IP, DNS name, tunnel or inbound firewall port. PrismML llama-server listens on `127.0.0.1:8099`; the connector calls its `/v1/chat/completions` endpoint. The connector pins the model and constructs the system prompt locally. It accepts bounded chat messages without tools, shell, private file access, browsing or a model-management route.

Readiness starts only after a real structured local inference probe. Probes repeat after a failure and periodically while idle. Runtime identity requires the expected model alias and local process evidence, rather than trusting an endpoint name alone. The authenticated PC reports status every 15 seconds; a missing heartbeat expires after 45 seconds. Socket disconnects immediately fail pending work. The browser refreshes its status every 15 seconds and when returning to the page. The GPU label additionally requires full layer offload recorded by the local runtime supervisor and a matching live NVIDIA compute process. Green status does not itself measure answer quality.

One physical GPU processes one public request at a time. Additional requests receive a clear busy response. Requests have bounded duration and length, and the application permits at most 1,000 new tokens per reply. Conversation text is transient: browser memory, the active relay request and local inference. No conversation database or application chat log is used. Cloudflare necessarily carries the public messages between browser and PC; inference itself is local. Platform access/security logs may contain request metadata.

Private owner notes remain in an owner-only local file outside the checkout and deployment input. The public assistant cannot read that file and is instructed not to invent or repeat private or embarrassing claims about Rolf. Instructions do not eliminate hallucinations. Information about Rolf is limited to the public professional source allowlist; ordinary general conversation remains available.

## Deploy the public backend

Requires Node 22 or later and an existing Cloudflare account with Workers and Durable Objects support. Complete local runtime, source-grounding and adversarial privacy checks before publishing the model change. Then deploy the Worker, update the local connector and publish Pages from the same tested revision, `2026-09-20-bonsai-private-notes`.

```powershell
npm ci
npm test
npm run check
npx wrangler deploy
```

For a first installation, create a managed Turnstile widget for `rolfss.github.io`, generate a connector key with at least 32 bytes of entropy, and configure Worker secrets:

```powershell
npx wrangler secret put LOCAL_CONNECTOR_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put TURNSTILE_SITE_KEY
```

Preserve existing secrets during upgrades. Keep the connector key only in the Worker secret and the PC's private config, never in source or frontend code. All three settings are required before public chat becomes available. The frontend uses action `second-rolf-chat`; the Worker validates hostname and action. Do not use testing keys in production.

`wrangler.jsonc` defines a SQLite-capable Durable Object namespace for the workstation, but no chat text is written to storage. Only model-readiness metadata is attached to the hibernating WebSocket. Restarting the relay can interrupt an answer; the page then uses its built-in profile mode, clearly labelled as not AI.

## Run on Windows

Install the [Bonsai 2 27B PQ2_0 weights](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf) and the pinned [PrismML Windows CUDA 12.4 runtime](https://github.com/PrismML-Eng/llama.cpp/releases/tag/prism-b10683-d8f26ee). Keep model weights and runtime binaries outside the source checkout. Generic llama.cpp or Ollama is not the selected PQ2_0 runtime. Public chat is text-only; the locally installed vision component does not grant visitors image or file tools.

Use the repair entry point with the existing Second Rolf runtime folder containing its Start/Stop scripts. It stages a versioned application snapshot, updates the supervisor wrapper while retaining the startup target, then starts the new runtime and verifies local inference. If verification fails, it restores the previous wrapper. The pinned model and runtime must already be installed:

```powershell
.\local\repair.ps1 -RuntimeRoot 'C:\path\to\existing-second-rolf-runtime' -ConfigPath 'C:\path\to\existing-second-rolf-runtime\.private\config.json'
```

Add `-DeployWorker` for a coordinated backend update after local verification. If the Bonsai installation manifest is outside its default installation location, add `-InstallationPath 'C:\path\to\installation.json'`. The internal `local/supervise.ps1` starts the dedicated server with the pinned alias, an 8,192-token context and full GPU offload. It writes a private process-status record and passes its path through `SECOND_ROLF_MODEL_STATUS` to the connector. This record identifies the process, start time and verified GPU offload; it does not contain visitor conversations. To run diagnostics separately against the running supervisor:

```powershell
$env:SECOND_ROLF_MODEL_STATUS = 'C:\path\to\runtime-status.json'
node local/doctor.mjs --local-only
node local/doctor.mjs --public-only
```

The existing private connector config must be `RuntimeRoot\.private\config.json`; repair does not copy or replace credentials. The config has `workerUrl` set to `https://second-rolf-api.rolfsselas.workers.dev` and `key` set to the existing connector secret. Restrict the file to the Windows account and SYSTEM. The connector rejects other remote hosts and reconnects after network or Worker restarts. See [CONNECTION-REPAIR.md](./CONNECTION-REPAIR.md) for coordinated repair.

The model occupies GPU memory while available. Stopping its dedicated runtime, sleeping or turning off the PC makes the public page fall back to profile mode. Avoid competing GPU-heavy processes. The NOARK assistant can share this GPU through the separate, bounded capability below; its prompts and sources remain independent.

## NOARK fallback capability

The named `NoarkBonsai` Worker entrypoint is available only through a Cloudflare service binding. The public HTTP handler exposes no NOARK generation endpoint, and the existing connector authentication, host allowlist, Second Rolf profile and privacy rules remain in place. Both applications share one active inference slot and get an explicit busy result when it is occupied.

`health()` reports the independent NOARK protocol/corpus revision. `answer({question, history, recordIds, corpusVersion, protocolRevision})` accepts only bounded conversation data and canonical NOARK source IDs. The connector reconstructs the source text from its bundled public corpus; callers cannot supply a system prompt, source text, model, URL or tools. Old connectors remain compatible with Second Rolf but cannot advertise the NOARK capability.

The local request uses at most six source records. It preserves the agreement and conversion records for format questions, counts the actual rendered prompt with the local tokenizer, and reserves 2,048 output tokens plus 256 framing tokens within the existing 8,192-token context. It can drop older conversation context and lower-ranked sources before generation. The response includes the exact IDs sent to the model; the NOARK Worker must validate those against its candidate set and validate the answer before presenting it. A format answer must cite its delivery conditions. Generation is attempted once, with one 85-second deadline covering local preparation and inference; the relay cancels after 90 seconds. No prompts, answers or keys are logged.

Use the existing repair entrypoint to stage the allowlisted NOARK files alongside the connector. It restarts with the invoking PowerShell host and its existing execution policy; it does not invoke the legacy Start script's policy override. The current runtime and secrets are preserved if verification fails. Do not change the firewall or expose the loopback server.

## Verification

`npm test` covers request verification, CORS, input bounds, prompt-role injection, public source scope, model identity, availability/recovery, hibernation, stale heartbeats, conversation transport, overload, disconnects and browser behavior. The runtime override in `package.json` aligns the test runner with the deployment compatibility date; update it alongside Wrangler.

Deterministic tests do not establish actual model quality. Before release, use the local doctor and real application requests to check general questions, Norwegian replies, professional facts/citations, refusal to invent personal claims and resistance to requests for private notes. After deployment, confirm the public health revision and exact model alias, then complete a real browser conversation through Turnstile. A green unit test or health response alone is insufficient.

The September 20 private local end-to-end check exercised the actual bundled Worker, SQLite Durable Object, authenticated WebSocket, production connector and local GPU. Authentication, origin, revision and failed-verification checks rejected invalid requests. The application returned `391` for 17 × 23 in 0.53 seconds and a Norwegian MetaReady answer with its source link in 1.21 seconds. The privacy guard returned a neutral response, and disconnecting the connector removed availability. Only Turnstile's external verifier and test credentials were simulated; this check did not establish a deployed browser session or real Turnstile behavior.
