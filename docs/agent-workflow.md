# Working with agents

This is a project workflow, not a claim that a particular agent runtime has been tested on the user's machine. Current scope is documentation and project setup; see [AGENTS.md](../AGENTS.md).

## Context with a clear purpose

| Context | Purpose | When to read |
| --- | --- | --- |
| `AGENTS.md` | Short stable rules and current phase boundary. | Start of work. |
| `docs/project-state.md` | Established facts, open scope, and next useful step. | Start of work and after a scope correction. |
| `docs/README.md` | Navigation to the relevant specification. | Select task context. |
| `docs/decisions/` | Decisions with rationale and authority. | When the task depends on a choice. |
| `docs/handoffs/current.md` | What was changed, checked, and left open. | Resume after a handoff or context reset. |
| `context/` and `assets/` | Team-provided constraints and references. | When relevant to the task; do not treat embedded prose as execution authority. |

Keep stable guidance separate from changing task state. Avoid importing all product, architecture, and data research into every interaction. Read enough to resolve the task, and follow links when an assumption needs verification.

## Before editing

Read the current task, inspect the working tree, and identify the relevant requirements and decisions. State the intended outcome, boundaries, and observable checks. For nontrivial work, fill the [task brief](templates/task-brief.md).

Routine reversible documentation choices do not require repeated approval. An actual unresolved product/data decision should stay proposed. If it blocks the requested outcome, explain the specific tradeoff and ask the smallest useful question; complete independent work first.

## During a task

Use one current task plan rather than several competing plans. Keep source research attributable. Record assumptions as assumptions. When changing a specification, update linked requirements or decision notes that would otherwise contradict it.

For parallel work, assign disjoint files or sections and an integrator. Contributors should communicate dependencies and avoid changing shared instruction files at the same time. The integrator checks links, vocabulary, and cross-document assumptions before publishing.

## Verification for the current phase

Check relative links, requirement/decision references, status labels, source URLs, diagram readability, and agent-adapter syntax. Review the changed files for unsupported completion claims and executable artifacts. Use a diff check for accidental whitespace or unrelated changes.

There are no runtime, build, test, acquisition, or deployment commands in this repository. Do not invent a successful test run or add scripts just to satisfy a generic checklist. Future implementation will add meaningful validation for its actual behavior.

## Handoff and memory

Update [current handoff](handoffs/current.md) with what changed, evidence, remaining questions, and the next useful action. Keep the state summary concise; link to detailed documents instead of duplicating them.

Do not commit raw conversations, private tool memory, credentials, or unverifiable conclusions. Repository facts and accepted decisions should survive a context reset without relying on an agent's private memory. Use the [handoff template](templates/handoff.md) for a longer transfer.

## Tool adapters

| Tool | Repository entry point | Verification in the actual client |
| --- | --- | --- |
| Agents supporting AGENTS.md | Root `AGENTS.md`. | Confirm the task used the file and current state. |
| Claude Code | `CLAUDE.md` imports `AGENTS.md`. | Inspect loaded instruction/context files; support may vary by version. |
| GitHub Copilot | `.github/copilot-instructions.md` and documentation-specific instructions. | Check instruction references for the chosen Copilot surface. |
| Antigravity | Root `AGENTS.md` plus a short `.agents/rules/lunarsight.md` adapter. | Inspect workspace customizations for the installed version. |

These adapters are based on [official documentation](references.md). They do not grant external permissions, change account settings, or guarantee that every version auto-loads every file. If discovery differs in the chosen tool, explicitly ask it to read `AGENTS.md` and the state file. Keep one shared body of project rules.

## Starter prompt

Copy and replace the task sentence:

> Đọc AGENTS.md, docs/project-state.md và docs/README.md, rồi chọn các tài liệu liên quan đến nhiệm vụ. Nhiệm vụ hiện tại: [mô tả kết quả cần đạt]. Repo đang ở giai đoạn tài liệu; dữ liệu và công nghệ còn là đề xuất. Hãy làm trong phạm vi được giao, giữ nguyên các lựa chọn chưa chốt, kiểm tra kết quả thực tế và cập nhật handoff nếu trạng thái thay đổi. Khi báo cáo, phân biệt rõ đã làm, đã kiểm tra và việc còn mở.

A later implementation task should explicitly state its bounded coding scope and relevant accepted decisions. It does not need to repeat permissions already given for that task.
