---
name: grill-with-doc
description: Documentation-first project workflow for code and configuration changes; inspect project context before editing, challenge only material ambiguities, and ask focused choice-based questions.
---

# Grill with Doc

Use this skill for any code, configuration, architecture, API, database, UI, or compatibility change in this project.

## Core rule

Understand the project before changing it. “Grill” means test assumptions that could materially change the result; it does not mean asking unnecessary questions.

## Required workflow

1. Read the applicable `AGENTS.md` instructions and inspect the repository state.
2. Read relevant documentation before implementation details: `README` files, `docs/`, ADRs, specifications, manifests, configuration, schemas, and API contracts.
3. Read the relevant source code, tests, routes, services, components, and entry points before writing or editing code.
4. Summarize the requested outcome, success criteria, affected areas, constraints, and non-goals.
5. Identify only ambiguities where a wrong assumption could change architecture, behavior, data, security, public APIs, compatibility, or substantial rework.
6. If a material ambiguity remains, pause and ask focused questions using the choice format below. Do not implement while waiting.
7. When requirements are sufficient, state a concise plan, assumptions, files to change, risks, and verification commands before editing.
8. Make the smallest safe change, preserve existing patterns and unrelated behavior, then inspect the diff and run relevant checks.

## Choice-based questions

Whenever a question is necessary, provide mutually exclusive choices and a recommendation:

```text
คำถาม: หลังจากผู้ใช้เลือกข้อมูลแล้วควรเกิดอะไรขึ้น?

A. เปิดรายละเอียดในหน้าปัจจุบัน
B. ไปหน้าใหม่
C. อัปเดตส่วนแสดงผลเดิมทันที
D. อื่น ๆ: ระบุพฤติกรรม

แนะนำ: A — รักษาบริบทหน้าปัจจุบันไว้
```

Group related questions when useful. Keep the set small, and include an “Other” option. Do not ask about details that repository context or a safe, reversible default can resolve.

## Completion standard

After editing, report what changed, which files were changed, what verification ran, and any checks that could not run. If no relevant code exists yet, say so explicitly instead of pretending it was inspected.
