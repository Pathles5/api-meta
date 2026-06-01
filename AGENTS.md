# AGENTS.md

## Objective

This project is used to learn OpenCode CLI, Ollama, and AI-assisted software development agents.

The priority is not speed but decision quality and clear explanations.

---

## Workspace Rules

The project root is the directory where this file is located.

Mandatory rules:

* Use relative paths only.
* Do not use absolute paths.
* Do not access directories outside the workspace without explicit authorization.
* All new files must be created inside the current workspace.

Before any significant modification:

1. Analyze the existing structure.
2. Briefly explain the plan.
3. Execute the changes.

---

## Development Philosophy

Prefer:

* Simple code.
* Readable code.
* Maintainable code.

Avoid:

* Unnecessary complexity.
* Premature optimization.
* Unnecessary dependencies.

---

## Architectural Changes

Before introducing:

* New AWS services
* New external dependencies
* Infrastructure as Code changes
* Security changes

Explain:

* Reason
* Expected cost
* Rejected alternatives
* Operational impact

---

## Dependency Management

Before adding a new dependency:

1. Verify whether native Node.js can solve the problem.
2. Justify the dependency.
3. Prefer mature and widely adopted libraries.
4. Avoid unnecessary dependencies.

If a dependency introduces maintenance or security risks, explain them before installation.

---

## Security

Never store:

* Passwords
* API Keys
* AWS Access Keys
* Tokens

Use:

* GitHub Secrets
* AWS Secrets Manager
* Environment variables

Never expose secrets in logs.

---

## Cost Management

Goal:

Keep the project within AWS Free Tier whenever possible.

Before creating resources with potential costs:

* Notify the user.
* Explain the estimated cost.
* Propose a free alternative if available.

---

## User Interaction

When a new feature is requested:

1. Explain the plan.
2. Create or modify actual files.
3. Summarize the changes made.

Do not respond only with code snippets in chat when files can be modified directly.

---

## Completion Criteria

When a task is completed:

* Stop.
* Summarize the changes.
* Do not start additional improvements unless explicitly requested.

Avoid continuous optimization loops.

Do not perform optional refactoring unless explicitly requested.

---

## Quality

After implementing changes:

* Check for obvious errors.
* Verify imports.
* Ensure naming consistency.
* Review project structure.

---

## Learning

This project is intended for educational purposes.

When a technical decision is relevant:

* Briefly explain the reason.
* Mention alternatives when appropriate.

Avoid excessively long explanations.

---

## Session Startup

At the beginning of a new conversation:

1. Read AGENTS.md.
2. Read PROJECT_CONTEXT.md.
3. Read README.md.
4. Read docs/decisions.md if it exists.
5. Read docs/roadmap.md if it exists.

Before making significant changes, verify these documents.

---

## Maintenance

Whenever decisions are made, document them in docs/decisions.md and, if appropriate, in docs/roadmap.md.

Keep these files updated.

When milestones are reached or objectives are defined, update README.md accordingly.

---

## Context Management

If the conversation context is insufficient or ambiguous:

1. Review PROJECT_CONTEXT.md.
2. Review README.md.
3. Review docs/decisions.md.
4. Review docs/roadmap.md.

Do not assume undocumented requirements.

If contradictions are detected between documents, ask before proceeding.

---

## Documentation

Update documentation whenever there is:

* An architectural change
* A new AWS service
* A new deployment workflow
* A significant security change
* A significant cost-related change

Keep the following synchronized:

* README.md
* PROJECT_CONTEXT.md
* docs/decisions.md
* docs/roadmap.md
