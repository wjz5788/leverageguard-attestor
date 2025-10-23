<!--
Sync Impact Report:
Version change:  → 0.1.0
Modified principles: None
Added sections: None
Removed sections: None
Templates requiring updates: 
  - .specify/templates/plan-template.md ⚠ pending
  - .specify/templates/spec-template.md ⚠ pending
  - .specify/templates/tasks-template.md ⚠ pending
  - .gemini/commands/speckit.analyze.toml ⚠ pending
  - .gemini/commands/speckit.checklist.toml ⚠ pending
  - .gemini/commands/speckit.clarify.toml ⚠ pending
  - .gemini/commands/speckit.constitution.toml ⚠ pending
  - .gemini/commands/speckit.implement.toml ⚠ pending
  - .gemini/commands/speckit.plan.toml ⚠ pending
  - .gemini/commands/speckit.specify.toml ⚠ pending
  - .gemini/commands/speckit.tasks.toml ⚠ pending
  - .codex/prompts/speckit.analyze.md ⚠ pending
  - .codex/prompts/speckit.checklist.md ⚠ pending
  - .codex/prompts/speckit.clarify.md ⚠ pending
  - .codex/prompts/speckit.constitution.md ⚠ pending
  - .codex/prompts/speckit.implement.md ⚠ pending
  - .codex/prompts/speckit.plan.md ⚠ pending
  - .codex/prompts/speckit.specify.md ⚠ pending
  - .codex/prompts/speckit.tasks.md ⚠ pending
  - README.md ⚠ pending
Follow-up TODOs: TODO(RATIFICATION_DATE)
-->
# LeverageGuard / LeverSafe Project Constitution

## Core Principles

### I. Branch Management
The `main` branch must remain stable. Feature development should use `feature/<scope>-<desc>` branches, and urgent fixes should use `hotfix/<issue>` branches.

### II. Commit Convention
Follow `type(scope): summary` format (e.g., `feat(risk-model): add liquidation probability script`). Document-related commits can use `docs(...)`.

### III. Sensitive Information Handling
API Keys, private keys, and other sensitive configurations are strictly forbidden from being committed directly to the repository. Use `env/*.env` files (which are `.gitignore`d) or dedicated secret management tools.

### IV. CI/Testing
Smart contracts use Foundry, and frontend uses Node 20. Continuous Integration (CI) via `.github/workflows/ci.yml` is recommended to ensure Pull Request quality.

### V. Documentation & Readme
All major components, especially frontend dApps and risk control services, must have comprehensive `README.md` files and operational instructions within the `src/` directory.

## Additional Constraints
The project aggregates product solutions, technical implementations, and operational data related to LeverageGuard / LeverSafe. It supports collaboration within a single repository, organized by 'Documentation / Source Code / Data', and includes sub-projects like Base ecosystem grant applications, risk control models, and frontend demonstrations.

## Development Workflow
The development workflow emphasizes clear branch management, standardized commit messages, secure handling of sensitive information, and continuous integration for quality assurance. Future plans include enhancing documentation for smart contracts and funding applications, completing READMEs for source components, and introducing automated validation and demo materials.

## Governance
This constitution supersedes all other practices. Amendments require proper documentation, approval, and a migration plan. All Pull Requests and code reviews must verify compliance with these principles. Any complexity introduced must be justified. Refer to project-specific guidance files for runtime development instructions.

**Version**: 0.1.0 | **Ratified**: TODO(RATIFICATION_DATE) | **Last Amended**: 2025-10-23

