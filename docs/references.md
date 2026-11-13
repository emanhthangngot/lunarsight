# References used for repository setup

Checked: **13 November 2026**. These are primary documentation references for the project setup. Their pages explain tool behavior; their example commands are not commands this repository needs to run.

| Reference | Applied here |
| --- | --- |
| [AGENTS.md open format](https://agents.md/) | A predictable root entry point for agent instructions, separate from the human README. |
| [GitHub Copilot repository instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions) | Short repository-wide guidance and a documentation-specific instruction file with `applyTo`. |
| [Claude Code project instructions and memory](https://code.claude.com/docs/en/memory) | A small `CLAUDE.md` adapter importing the shared instructions; concise, consistent project context. |
| [Antigravity rules](https://antigravity.google/docs/rules/) | Root guidance plus a short workspace rule with valid `trigger: always_on` frontmatter. |
| [GitHub issue and pull-request templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates) | Templates for bounded tasks, findings, decision proposals, and review evidence. |
| [C4 system context diagrams](https://c4model.com/diagrams/system-context) | Explain users and system responsibilities before selecting technologies. |

## How these references are used

The shared `AGENTS.md` holds project rules; detailed specifications are read only when relevant. Tool adapters point to the same guidance. The project uses a state file, decision records, and a handoff to make its current scope explicit across sessions. These are design choices for this repository, not claims that instructions alone enforce permissions or guarantee agent compliance.

Tool discovery can differ by product surface and installed version. The adapters have been prepared from documentation; live loading should be checked in the team's actual client. No account setting, custom permission, remote agent job, or automation has been enabled by adding these files.

## Product and scientific references

The [team proposal](reference/proposal-v2.md) is the source for the intended product behavior and historical prototype findings. [Data sources](data-sources.md) links the candidate scientific archives. Each future scientific result will need its exact product, version, coverage, units, and processing evidence; a project-level source list is not sufficient by itself.
