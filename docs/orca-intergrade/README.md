# แผนพัฒนา Terminal แบบ Orca (Agent picker + Session ที่ไม่หาย)

- เขียนเมื่อ: 2026-10-11 · branch: `upgrade-feature-and-engine`
- สถานะ: **ยังไม่เริ่มลงมือ** — เอกสารนี้คือแผนสำหรับ session ถัดไป
- อ้างอิงต้นแบบ: [stablyai/orca](https://github.com/stablyai/orca) (MIT License) — ลิงก์ไฟล์ทั้งหมดในเอกสารนี้ตรึงไว้ที่ commit [`ca1aac6`](https://github.com/stablyai/orca/tree/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb) เพื่อไม่ให้ลิงก์เลื่อนตาม `main`
- หลักการ: เอา **แนวคิด** ของ Orca มาใช้ ไม่ลอกโค้ดทั้งก้อน (โฟลเดอร์ daemon ของ Orca อย่างเดียวมี 259 ไฟล์)
- แผนอื่นในโฟลเดอร์นี้: [markdown.md](markdown.md) — Markdown viewer สลับโหมด Source / Split / Preview

## 0. สิ่งที่ผู้ใช้ตัดสินใจแล้ว

| เรื่อง | คำตอบ |
|---|---|
| แท็บ terminal เป็นของใคร | **แต่ละโปรเจกต์** — สลับโปรเจกต์แล้วเห็นชุดแท็บของโปรเจกต์นั้น; session ของโปรเจกต์เดิมรันต่อเบื้องหลัง |
| อยู่รอดหลังปิดแอป | **เริ่มที่ 3a** (resume บทสนทนา Claude/Codex + เก็บ scrollback ลงดิสก์) · 3b daemon เลื่อนไปก่อน |
| Agent ที่รองรับ | **Claude Code + Codex** เท่านั้นในรอบนี้ (ออกแบบให้เพิ่มตัวอื่นได้ทีหลังโดยแก้ตารางเดียว) |
| ติดตั้ง package | ต้อง **ขออนุญาตทุกครั้ง** พร้อมเหตุผล คำสั่ง และเวอร์ชันที่แน่นอน (กฎใน `CLAUDE.md`) |

## 1. Orca ทำอย่างไร (ตรวจจากซอร์สแล้ว)

### 1.1 ชุดเครื่องมือ — [`package.json`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/package.json)
Orca **ไม่ได้ใช้ terminal native** ใช้ xterm.js + node-pty เหมือนเรา แต่ครบชุดกว่า:

| package | Orca ใช้ | เรามีตอนนี้ |
|---|---|---|
| `@xterm/xterm` | 6.1.0-beta.303 | 6.0.0 |
| `node-pty` | ^1.1.0 | 1.1.0 (pinned + `scripts/patch-node-pty.mjs`) |
| `@xterm/addon-fit` | 0.12.0-beta | 0.11.0 |
| `@xterm/headless` | 6.1.0-beta | — |
| `@xterm/addon-serialize` | 0.15.0-beta | — |
| `@xterm/addon-webgl` | 0.20.0-beta | — |
| `@xterm/addon-unicode11` | 0.10.0-beta | — |
| `@xterm/addon-search` | 0.17.0-beta | — |
| `@xterm/addon-web-links` | 0.13.0-beta | — |
| `@xterm/addon-image`, `addon-ligatures` | beta | — (ไม่จำเป็นรอบนี้) |

### 1.2 PTY อยู่นอกหน้าต่าง (daemon)
- [`src/main/daemon/daemon-entry.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/main/daemon/daemon-entry.ts) — *"runs as a standalone Node.js process"* คุยผ่าน socket + token
- [`src/main/daemon/session.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/main/daemon/session.ts) — 1 `Session` = 1 PTY มี `sessionId`; client แค่ attach/detach (create-or-attach)

### 1.3 Terminal เงาฝั่ง server (headless) เพื่อคืนหน้าจอ
- [`src/main/daemon/headless-emulator.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/main/daemon/headless-emulator.ts) — ป้อนทุก byte เข้า `@xterm/headless` + `SerializeAddon` + `Unicode11Addon` แล้ว serialize เป็น snapshot ส่งให้ client ที่เพิ่ง attach
- ข้อสังเกตในซอร์ส: reply ของ terminal query ต้องไม่ถูกส่งกลับ PTY ตอน replay snapshot (`forwardQueryReplies` default false) — **ต้องทำแบบเดียวกัน** ไม่งั้นการ attach ซ้ำจะยิงตัวอักษรขยะเข้า shell
- [`src/main/terminal-scrollback-snapshots.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/main/terminal-scrollback-snapshots.ts) — เก็บ scrollback ลงดิสก์ (temp + rename) เพื่อ cold restore
- [`src/shared/terminal-scrollback-policy.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/shared/terminal-scrollback-policy.ts) — ค่าเริ่ม 5,000 บรรทัด, สูงสุด 50,000; output backlog cap ≥ 2 MB

### 1.4 WebGL แบบมีทางถอย
- [`terminal-webgl-auto-policy.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/lib/pane-manager/terminal-webgl-auto-policy.ts) — ปิด WebGL เองถ้า renderer เป็น software (เช่น SwiftShader/llvmpipe)
- [`pane-webgl-context-loss-policy.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/lib/pane-manager/pane-webgl-context-loss-policy.ts), [`terminal-webgl-atlas-recovery.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/components/terminal-pane/terminal-webgl-atlas-recovery.ts) — กู้คืนเมื่อ WebGL context หลุด
- [`terminal-webgl-hidden-retention.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/renderer/src/lib/pane-manager/terminal-webgl-hidden-retention.ts) — แท็บที่ซ่อนเก็บ WebGL context ได้ไม่เกิน 6 (LRU)

### 1.5 ตัวเลือก Agent
- [`src/shared/tui-agent.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/shared/tui-agent.ts) — union ของ agent 45 ตัว
- [`src/shared/tui-agent-config.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/shared/tui-agent-config.ts) — ตารางต่อ agent: `detectCmd`, `promptInjectionMode` (`argv` / `stdin-after-start`), `draftPromptFlag` (Claude ใช้ `--prefill`), `preflightTrust`
- [`src/shared/tui-agent-detection-commands.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/shared/tui-agent-detection-commands.ts) — สร้างรายการคำสั่งตรวจจากตาราง (แสดงเฉพาะ agent ที่หาเจอ)
- [`src/main/agent-launch/agent-launch-prompt-delivery.ts`](https://github.com/stablyai/orca/blob/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/main/agent-launch/agent-launch-prompt-delivery.ts) — prompt แรกส่งทาง argv ถ้าทำได้ (ไม่มี race), ไม่งั้น bracketed paste หลัง PTY พร้อม

## 2. สภาพปัจจุบันของ Video Studio (ตรวจแล้ว 2026-10-11)

| จุด | ที่อยู่ | ผล |
|---|---|---|
| PTY ผูกกับ WebSocket | `lib/studio-terminal.mjs:106-110` (`ws.on('close')` → `term.kill()`) | ปิดการเชื่อมต่อ = PTY ตาย |
| xterm สร้างใหม่ตาม project | `app/src/components/Console.tsx:83` (deps `[project,session.id,…]`) | สลับโปรเจกต์ → session ทุกแท็บตาย **(บทสนทนา Claude หาย)** |
| แท็บ/ชนิดแท็บ | `Console.tsx:16,21,98` (`vs-terminal-sessions` เก็บแค่ kind) | เปิดแอปใหม่ได้ PTY ใหม่ ไม่ resume |
| claude/codex ในแท็บ | `lib/studio-terminal.mjs:18-23` (`SESSION_COMMANDS`, ต่อท้าย `; claude` ใน `-Command`) | ไม่มี model / prompt / resume |
| เพดาน session | `lib/studio-terminal.mjs:24,70` (`MAX_SESSIONS=6`, ตอบ 429) | นับรวมทั้ง server ไม่แยกโปรเจกต์ |
| Renderer | `Console.tsx:67` DOM renderer, ไม่มี addon นอกจาก fit | ไม่มี WebGL/unicode11/search/links |
| Electron เป็นเจ้าของ server | `electron/main.cjs:71-72,85-86` | ปิดแอป = server ปิด = PTY ทั้งหมดตาย (ระดับ 3a แก้ด้วย resume, 3b แก้ด้วย daemon) |
| Insert bar / ภาพเฟรม | `app/src/components/InsertBar.tsx`, `sendToTerminal()` ใน `Console.tsx` | ส่งเข้าแท็บที่ active — ต้องคงไว้ |

ตรวจ CLI ในเครื่อง (สั่งแค่ `--help`/`--version` ไม่เปิด session):
- `claude` **2.1.296** — `claude [options] [command] [prompt]`; มี `--model`, `--session-id <uuid>`, `-r/--resume [value]`, `-c/--continue`; **`--prefill` ไม่อยู่ใน `--help`** (Orca ใช้ — อาจเป็น flag ซ่อน ต้องทดสอบ)
- `codex` **codex-cli 0.148.0** — `codex [OPTIONS] [PROMPT]`; มีคำสั่ง `resume` ("picker by default; use --last …")
- agent อื่น (gemini, opencode, aider, qwen, copilot, cursor-agent, amp, goose) ไม่พบในเครื่อง

## 3. เป้าหมายและขอบเขต

**ทำในรอบนี้**
1. Agent picker: Claude Code / Codex / PowerShell — ตรวจว่าติดตั้งไหม, เลือก model, ใส่ prompt เริ่มต้น
2. Session ไม่หายเมื่อสลับโปรเจกต์ รีโหลดหน้า ปิด/เปิดแท็บ หรือหน้าจอหลุด (ระดับ 1)
3. Renderer: WebGL (+ทางถอย), unicode11, ค้นหา, ลิงก์ (ระดับ 2)
4. หลังเปิดแอปใหม่: แท็บกลับมา, scrollback เดิมแสดง, Claude/Codex resume บทสนทนาเดิม (ระดับ 3a)

**ไม่ทำรอบนี้**
- daemon แยก process (3b) — อธิบายไว้ใน §9 เผื่อทำทีหลัง
- agent อื่นนอกจาก Claude Code/Codex, split pane, SSH/remote, mobile
- เปลี่ยน PowerShell execution policy ถาวร, อัปเกรด `node-pty` (pinned)

## 4. สถาปัตยกรรมเป้าหมาย

```
Renderer (React)                          studio.mjs (Node, ใน Electron main หรือ npm run studio)
┌─────────────────────────────┐           ┌───────────────────────────────────────────────┐
│ Terminal panel (per project)│  HTTP     │ SessionRegistry                                │
│  tabs ← GET /sessions        │──────────▶│  Map<sessionId, TerminalSession>               │
│  + picker ← GET /agents      │           │   ├─ project, kind(claude|codex|powershell)    │
│  xterm + webgl/unicode/...   │  WS       │   ├─ pty (node-pty, cwd projects/<p>)          │
│   attach ?session=<id>       │◀────────▶ │   ├─ mirror (@xterm/headless + serialize)      │
│   ← {type:'snapshot'} then   │           │   ├─ attached sockets (0..n)                   │
│   ← {type:'data'} stream     │           │   ├─ agentSessionId (claude --session-id)      │
└─────────────────────────────┘           │   └─ idle timer / exit state                   │
                                           │ Persist: <workspace>/.cache/terminal/<p>.json  │
                                           │          + snapshot files (temp + rename)      │
                                           └───────────────────────────────────────────────┘
```

กติกาหลัก
- **PTY เป็นของ server ไม่ใช่ของ WebSocket** — socket ปิดแค่ detach
- PTY ตายเมื่อ: ผู้ใช้ปิดแท็บ (`DELETE`), shell exit เอง, server ปิด, หรือไม่มีใคร attach เกิน `IDLE_MS` (ค่าเริ่มเสนอ 30 นาที; ตั้งได้)
- 1 session ติดกับ 1 project ตลอดชีวิต (cwd = `projects/<p>`)
- เพดาน: ≤ 6 session ต่อโปรเจกต์, ≤ 12 ทั้ง server (ป้องกัน PowerShell ค้างเต็มเครื่อง)

## 5. Phase ย่อย (ทำตามลำดับ แต่ละ phase ต้องผ่านเทสต์ก่อนไปต่อ)

### Phase 0 — เตรียม (ต้นทุนต่ำ, ทำก่อนเขียนโค้ด)
1. รัน baseline: `npm run ui:check`, `npm test`, Electron smoke ทั้ง 5 ตัว — จดผลจริง
2. **ขออนุญาตติดตั้ง** (แจ้งเหตุผล + คำสั่ง + เวอร์ชันแน่นอนก่อนรัน) — เลือกเวอร์ชัน **stable** ที่เข้ากับ `@xterm/xterm@6.0.0` (Orca ใช้ beta ของ 6.1 — ไม่ตามเพราะเราไม่ได้ใช้ 6.1):
   - ตรวจก่อนด้วย `npm view @xterm/<addon> versions` + วันที่ปล่อยเทียบกับ `@xterm/xterm@6.0.0` และอ่าน CHANGELOG/peer requirement (ตอนเขียนแผน `npm view … peerDependencies` ว่างทุกตัว จึง **ต้องพิสูจน์ด้วยการติดตั้งแล้วรันเทสต์**)
   - ร่างคำสั่ง (เวอร์ชันยืนยันตอนทำ):
     `npm install --save-exact @xterm/headless@<6.0.x> @xterm/addon-serialize@<…> @xterm/addon-unicode11@<…> @xterm/addon-webgl@<…> @xterm/addon-search@<…> @xterm/addon-web-links@<…>`
   - `@xterm/headless` ต้องอยู่ใน `dependencies` (ใช้ฝั่ง server/Electron main) ส่วน addon ฝั่ง renderer เข้า bundle ของ Vite
3. ตรวจ flag จริงของ CLI ด้วยการทดลองใน **โฟลเดอร์ชั่วคราว** และขออนุญาตผู้ใช้ก่อน เพราะเปิด session ในบัญชีผู้ใช้:
   - `claude --session-id <uuid>` แล้วออก → `claude --resume <uuid>` ได้บทสนทนาเดิมไหม; ถ้า session ยังไม่มีข้อความ resume ทำอะไร
   - resume ต้องรันใน cwd เดิมไหม (คาดว่าใช่ — Claude เก็บ session ตามโฟลเดอร์ — **ต้องยืนยัน**)
   - `--prefill` มีจริงไหมในเวอร์ชันนี้
   - `codex resume --last` เลือกจากโฟลเดอร์ปัจจุบันหรือทั้งเครื่อง; มีวิธีอ้าง session id แน่นอนไหม
   - ปุ่มล้างบรรทัดของ Claude Code / Codex (ตอนนี้ Clear line แสดงเฉพาะแท็บ PowerShell)

### Phase 1 — Agent picker (Claude Code + Codex)
**Server**
- ตาราง agent ไฟล์เดียว `lib/terminal-agents.mjs` (แนว `TUI_AGENT_CONFIG` ของ Orca):
  ```js
  // id → วิธีตรวจ/เปิด/resume; เพิ่ม agent ใหม่ = เพิ่มแถว
  claude: { label:'Claude Code', detect:'claude', version:['--version'],
            launch:({model,prompt,agentSessionId}) => ['claude', ...(model?['--model',model]:[]), '--session-id', agentSessionId, ...(prompt?[prompt]:[])],
            resume:({agentSessionId}) => ['claude','--resume',agentSessionId] },
  codex:  { label:'Codex', detect:'codex', version:['--version'],
            launch:({model,prompt}) => ['codex', ...(model?['-m',model]:[]), ...(prompt?[prompt]:[])],  // ยืนยัน flag model ของ codex ใน Phase 0
            resume:() => ['codex','resume','--last'] },
  ```
- `GET /api/terminal/agents` → `[{id,label,installed,version}]` — ตรวจด้วย `where.exe <detect>` (Windows) แบบ `spawn` ไม่ผ่าน shell, timeout 3 วิ, cache 60 วิ; ต้องผ่าน cookie auth เดียวกับ terminal
- **ความปลอดภัยของ prompt/model** (สำคัญ): ตอนนี้คำสั่งต่อท้ายใน `-Command` ของ PowerShell — ห้ามต่อข้อความจากผู้ใช้เข้า string เด็ดขาด
  - ส่งผ่าน environment ของ PTY: `VS_AGENT_PROMPT`, `VS_AGENT_MODEL` แล้วใน `-Command` ใช้ `claude --model $env:VS_AGENT_MODEL $env:VS_AGENT_PROMPT` — PowerShell ส่งค่าตัวแปรเป็น argument เดียวโดยไม่ parse ซ้ำ
  - `model` ตรวจ regex `^[A-Za-z0-9._:-]{1,64}$`; `prompt` ยาว ≤ 4000, ห้าม `\0`
  - id agent ต้องอยู่ในตารางเท่านั้น (เหมือน `SESSION_COMMANDS` ตอนนี้)
- ร่าง `-Command` ต่อ kind ด้วยฟังก์ชันเดียวที่มี unit test (ต่อยอด `terminalLaunchArgs()`)

**Renderer**
- ปุ่ม `+` เปิด popover: รายการ agent (ปุ่ม disable + "ไม่ได้ติดตั้ง" ถ้าไม่พบ), ช่อง model (เลือกได้/ว่าง = ค่าเริ่ม), ช่อง prompt เริ่มต้น (มี quick fill `/make-video <project>`), ปุ่ม Start
- จำค่าที่เลือกล่าสุดต่อ agent ใน localStorage

**ยอมรับเมื่อ**: เปิดแท็บ Claude พร้อม prompt แล้ว Claude เริ่มด้วย prompt นั้นโดยไม่ต้องพิมพ์; ใส่ prompt ที่มี `"; Remove-Item …` แล้วไม่มีคำสั่งแปลกถูกรัน (test ด้วย agent จำลอง ดู §7)

### Phase 2 — Session ไม่หาย + แท็บต่อโปรเจกต์ (ระดับ 1)
**Server — `lib/terminal-sessions.mjs` (ใหม่) แยกจาก `studio-terminal.mjs` ที่ดูแล auth/upgrade**
- `TerminalSession { id, project, kind, title, createdAt, agentSessionId?, pty, mirror, sockets:Set, exited:{code}|null, idleTimer }`
- เขียน PTY output → `mirror.write(data)` และ broadcast ไป socket ที่ attach ทุกตัว
- mirror = `new Terminal({cols,rows,scrollback:5000,allowProposedApi:true})` จาก `@xterm/headless` + `SerializeAddon` + `Unicode11Addon`
- **query reply guard** (บทเรียนจาก Orca §1.3): mirror ห้ามส่ง reply ใด ๆ กลับเข้า PTY
- API (ทุกตัวต้องผ่าน cookie + origin check เดิม):
  - `GET  /api/terminal/sessions?project=` → `[{id,kind,title,exited,attached}]`
  - `POST /api/terminal/sessions` `{project,kind,model?,prompt?}` → `{id}` (ตรวจเพดาน 6/โปรเจกต์, 12/ทั้งหมด → 429)
  - `DELETE /api/terminal/sessions/<id>` → kill PTY (ใช้ลำดับ kill ที่ระวัง `AttachConsole failed` แบบเดิม: ไม่ kill PTY ที่ exit แล้ว)
  - `WS /api/terminal/ws?session=<id>` → ส่ง `{type:'snapshot',data:serialize(),cols,rows}` ก่อน แล้วค่อย `{type:'data'}`; ถ้า session exit แล้ว ส่ง snapshot + `{type:'exit'}`
- resize: socket ที่ส่ง resize ล่าสุดเป็นผู้กำหนดขนาด (หลายหน้าต่างดู session เดียวกันได้) — resize ทั้ง PTY และ mirror
- idle: เมื่อ `sockets.size===0` เริ่มจับเวลา `IDLE_MS`; attach ใหม่ยกเลิก
- ปิด server (`server.on('close')`, Electron `before-quit`) → kill ทุก session แบบเรียบร้อย + เขียน state สำหรับ 3a ก่อน
- project ถูกย้ายลง Trash → kill session ของโปรเจกต์นั้น (เชื่อมกับ `/api/studio/projects/trash`)

**Renderer — `Console.tsx`**
- เลิกสร้าง xterm ตาม `project` (`Console.tsx:83`); ใช้ `GET /sessions?project=` เป็นแหล่งความจริงของแท็บ
- สลับโปรเจกต์ = detach ทุกแท็บ + โหลดชุดแท็บของโปรเจกต์ใหม่ (session เก่ารันต่อ)
- แสดงจุดสถานะต่อแท็บ: running / exited / มี output ใหม่ระหว่างไม่ได้ดู (badge)
- โปรเจกต์ที่ยังไม่มี session → สร้าง PowerShell 1 แท็บอัตโนมัติ (เหมือนตอนนี้)
- ปิดแท็บ = `DELETE`; ถ้า agent กำลังทำงานอยู่ (ดูจากไม่มี prompt? — ใช้แค่ “มี output ใน 5 วิล่าสุด”) ถามยืนยันก่อน
- `localStorage['vs-terminal-sessions']` เลิกใช้ (server เป็นเจ้าของ) — เก็บแค่ “แท็บที่ active ล่าสุดต่อโปรเจกต์”

**ยอมรับเมื่อ**: พิมพ์ใน PowerShell → สลับโปรเจกต์ไปกลับ → ข้อความเดิมอยู่ และเป็น PTY เดิม (pid เดิม); รีโหลดหน้า → เหมือนเดิม; ปิดแท็บ → process หายจริง (`tasklist`)

### Phase 3 — Renderer addons (ระดับ 2)
- **WebGL**: `loadAddon(new WebglAddon())` ใน try; `onContextLoss` → dispose แล้วกลับไป DOM renderer; ตรวจ `WEBGL_debug_renderer_info` ถ้าเป็น SwiftShader/llvmpipe ไม่เปิด (แนว `terminal-webgl-auto-policy.ts`); แท็บที่ซ่อนนานเกิน N (เสนอ 4) ปล่อย WebGL context (แนว hidden-retention)
- **Unicode11**: `activeVersion='11'` ทั้งฝั่ง renderer และ mirror (ต้องตรงกัน ไม่งั้น snapshot คอลัมน์เพี้ยน)
- **Search**: `Ctrl+F` เมื่อโฟกัสอยู่ใน terminal เปิดกล่องค้นหาเล็กที่หัวแผง (ไม่ชน Ctrl+K/Ctrl+` ของแอป); Enter/Shift+Enter ไปถัดไป/ก่อนหน้า
- **Web links**: เปิดเฉพาะ `http(s)://` ผ่าน Electron `shell.openExternal` ด้วย IPC ใหม่ที่ allowlist scheme (ห้ามเปิด `file:`/`javascript:`); ในเบราว์เซอร์ใช้ `window.open(url,'_blank','noopener')`
- **ฟอนต์ไทย**: ใส่ฟอนต์สำรองที่มีอักษรไทยต่อจาก `"IBM Plex Mono"` แล้ว **ดูด้วยตา** ว่าสระ/วรรณยุกต์ไม่ล้นคอลัมน์ (ยังไม่เคยตรวจ)

**ยอมรับเมื่อ**: เทสต์ทั้งหมดผ่านทั้งมี/ไม่มี WebGL (บังคับปิดด้วย flag), ข้อความไทย+emoji ใน Claude วางคอลัมน์ถูก (ภาพหน้าจอ), Ctrl+F เจอข้อความใน scrollback

### Phase 4 — อยู่รอดหลังปิดแอป (ระดับ 3a)
**State บนดิสก์** — `<workspace>/.cache/terminal/` (`.cache/` อยู่ใน `.gitignore` แล้ว; ไม่ใช่ `projects/*/output/` เพราะไม่ใช่ผลงานเรนเดอร์)
- `<project>.json`: `[{id,kind,title,model,agentSessionId,activeTab,updatedAt}]` — เขียนแบบ temp + rename (แบบเดียวกับ `lib/render-status.mjs`)
- `<sessionId>.snapshot`: ผล `serialize()` ล่าสุด จำกัด ≤ 2 MB/ไฟล์ และ ≤ 50 MB ทั้งโฟลเดอร์ (ลบเก่าสุด) — เขียนทุก 5 วิเมื่อมี output ใหม่ + ตอนปิด
- **ความเป็นส่วนตัว**: scrollback อาจมี secret ที่ผู้ใช้พิมพ์/พิมพ์ออกมา → เก็บในเครื่องเท่านั้น, มีปุ่ม “ล้างประวัติ terminal” ใน Projects → Workspace, ไม่ส่งไปไหน

**ตอนเปิดแอปใหม่**
- โหลด `<project>.json` → สร้างแท็บเดิมในสถานะ “restored” แสดง snapshot เก่า (สีจาง + แถบ “Session ended when Studio closed”)
- PowerShell: ปุ่ม “Start new shell here”
- Claude Code: ปุ่ม/อัตโนมัติ (ให้ผู้ใช้เลือกในตั้งค่า) `claude --resume <agentSessionId>` ใน cwd เดิม → ถ้าล้ม (เช่น session ไม่มีข้อความ) เปิดใหม่ด้วย `--session-id` ใหม่และบอกผู้ใช้
- Codex: `codex resume --last` (หรือวิธีที่ Phase 0 พิสูจน์ว่าระบุ session ได้แน่นอนกว่า)

**ยอมรับเมื่อ**: เปิดแท็บ agent จำลอง (§7) → ปิด server → เปิดใหม่ → แท็บกลับมาพร้อม snapshot และคำสั่ง resume ที่ถูก (ตรวจ argv ที่ agent จำลองได้รับ); ทดสอบกับ Claude จริง **ด้วยตนเอง** หลังผู้ใช้อนุญาต

### Phase 5 — ปรับเอกสาร
- `CLAUDE.md` (Terminal), `docs/terminal-monaco-optimization.md`, `docs/studio-workspace.md`, `.claude/skills/make-video/SKILL.md` (การเปิดแท็บ Claude พร้อม prompt)
- `issues/NNN-*.md` สำหรับทุกบั๊กที่เจอระหว่างทำ (กฎใน `CLAUDE.md`)

## 6. ไฟล์ที่คาดว่าจะแตะ

| ไฟล์ | งาน |
|---|---|
| `lib/terminal-agents.mjs` (ใหม่) | ตาราง agent + ตรวจการติดตั้ง + สร้าง argv |
| `lib/terminal-sessions.mjs` (ใหม่) | SessionRegistry, mirror, idle, persist |
| `lib/studio-terminal.mjs` | เหลือ auth/upgrade/route; ใช้ registry |
| `studio.mjs` | route ใหม่, kill session ตอน trash project/ปิด server |
| `electron/main.cjs`, `electron/preload.cjs` | IPC `openExternal` (allowlist http/https), flush state ก่อน quit |
| `app/src/components/Console.tsx` | แท็บจาก server, attach/snapshot, addons, search UI, restored state |
| `app/src/components/AgentPicker.tsx` (ใหม่) | popover เลือก agent/model/prompt |
| `app/src/lib/state.ts` | `terminalKind` ต่อแท็บ active (มีแล้ว) + สถานะ session ต่อโปรเจกต์ |
| `tests/*` | ดู §7 |

## 7. แผนทดสอบ

ไม่เปิด Claude/Codex จริงในเทสต์อัตโนมัติ (ใช้บัญชีผู้ใช้/อาจมีค่าใช้จ่าย) → ทำ **agent จำลอง**: สคริปต์ `tests/fixtures/fake-agent.mjs` ที่พิมพ์ argv/env ที่ได้รับ แล้วอ่าน stdin; ให้ตาราง agent ชี้ไปที่มันผ่านตัวแปร env เฉพาะเทสต์ (เช่น `VIDEO_STUDIO_TEST_AGENT_BIN`) ที่ production ไม่อ่าน

| Phase | เทสต์ |
|---|---|
| 1 | unit: argv ต่อ agent/model/prompt; prompt อันตราย (`"; calc`, `$(…)`, backtick) ไปถึง fake agent เป็น argument เดียวตรงตัว; agent ที่ไม่อยู่ในตาราง → ปฏิเสธ; `/agents` ตอบ installed ถูก |
| 2 | WS: detach/attach ได้ PTY เดิม (pid เดิม) + snapshot มีข้อความเก่า; 2 socket ดู session เดียวกัน; idle timeout ปิด PTY; เพดาน 6/12 → 429; DELETE ฆ่า process จริง; สลับโปรเจกต์ใน UI แล้วกลับมา session เดิม; snapshot ไม่ยิง query reply เข้า PTY |
| 3 | WebGL เปิด/ปิด (บังคับ fallback) แล้วเทสต์ terminal เดิมทั้งหมดผ่าน; Ctrl+F; link เปิดเฉพาะ http(s) |
| 4 | ปิด/เปิด server → แท็บกลับ + snapshot + argv resume ถูก; ไฟล์ state เขียนแบบ atomic; เพดานขนาดโฟลเดอร์; ปุ่มล้างประวัติ |
| ทุก phase | `npm run ui:check`, `npm test`, Electron smoke ทั้ง 5 (`electron-smoke`, `electron-layout-smoke`, `electron-render-smoke`, `electron-new-project`, `electron-psreadline-smoke`) |

## 8. ความเสี่ยงและสิ่งที่ยังไม่ได้พิสูจน์

| เรื่อง | ทำไมเสี่ยง | วิธีลด |
|---|---|---|
| addon รุ่น stable เข้ากับ xterm 6.0.0 | ไม่มี peerDependencies ระบุ | ติดตั้งทีละตัว + รันเทสต์; ถ้าไม่เข้ากัน เสนออัปเกรด xterm (ขออนุญาตแยก) |
| `@xterm/headless` ใน Electron main | ต้องไม่มี DOM; Orca ใช้ polyfill (`xterm-env-polyfill`) | ทดสอบใน `npm run studio` และ Electron packaged |
| snapshot ทำให้ TUI (Claude) เพี้ยนตอน attach | alternate screen, cursor mode | ใช้ serialize ของ mirror + ส่ง mode rehydrate แบบ Orca (`terminal-mode-rehydrate-sequences`) ถ้าจำเป็น |
| resume ของ Claude ขึ้นกับ cwd/สถานะ session | ยังไม่ได้ทดลอง | Phase 0 ทดลองในโฟลเดอร์ชั่วคราวด้วยความยินยอม |
| `--prefill` ไม่อยู่ใน help | อาจไม่มีในเวอร์ชันนี้ | ใช้ prompt argument ไปก่อน; prefill เป็นทางเลือกเมื่อพิสูจน์แล้ว |
| PTY ค้างเมื่อ process ถูก kill แรง | Windows ไม่มี process group แบบ POSIX | ปิดผ่าน registry ทุกเส้นทาง; ตอนเริ่ม server ไม่ต้อง “เก็บกวาด” PTY เก่าเพราะ ConPTY ตายตาม parent — **ต้องตรวจด้วย `tasklist` หลัง kill -9 server** |
| scrollback มีข้อมูลลับ | เก็บลงดิสก์ | local-only, ปุ่มล้าง, ไม่รวมใน Git/backup ของโปรเจกต์ |
| node-pty pinned + patch | ห้ามอัปเกรดเงียบ | ไม่แตะ `node-pty`; `scripts/patch-node-pty.mjs` คงเดิม |

## 9. ระดับ 3b (daemon) — เลื่อนไว้ ใช้ตอนที่ 3a ไม่พอ
- แยก SessionRegistry ไปเป็น process `studio-ptyd` (รันด้วย `process.execPath` + `ELECTRON_RUN_AS_NODE=1` เหมือน task runner เดิม เพื่อใช้ ABI ของ node-pty ชุดเดียวกัน)
- คุยผ่าน named pipe (`\\.\pipe\video-studio-<user>-<hash>`) + token ไฟล์สิทธิ์ผู้ใช้; protocol NDJSON แบบ hello/version (Orca: `daemon-hello-protocol.ts`, `daemon-client-*.ts`)
- งานที่ Orca ต้องทำและเราต้องทำด้วย: ตรวจ daemon เก่า/เวอร์ชันไม่ตรง, ยึดคืน endpoint, ตาย-เมื่อ-user-logout, ปิด process ลูกบน Windows (Job Object), log ไฟล์
- อ้างอิง: [`src/main/daemon/`](https://github.com/stablyai/orca/tree/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/src/main/daemon), [`docs/audits/`](https://github.com/stablyai/orca/tree/ca1aac6af4d83e219f2fa2bd44123e1c3b6eafeb/docs/audits) (เช่น `daemon-late-exit`, `stale-pty-inventory`, `terminal-close-observed-exit`)

## 10. Checklist เริ่ม session หน้า
- [ ] อ่านเอกสารนี้ + `git log -5` + `git status -sb`
- [ ] Phase 0.1 baseline เทสต์ (จดผลจริง)
- [ ] Phase 0.2 เสนอเวอร์ชัน package + คำสั่ง → รอผู้ใช้อนุมัติ
- [ ] Phase 0.3 ขออนุญาตทดลอง `claude`/`codex` resume ในโฟลเดอร์ชั่วคราว
- [ ] Phase 1 → 2 → 3 → 4 → 5 (ผ่านเทสต์ทุก phase ก่อนไปต่อ, ไม่ commit/push จนผู้ใช้สั่ง)
