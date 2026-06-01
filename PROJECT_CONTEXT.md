# PROJECT_CONTEXT.md

## Name

Instagram REST API

---

## Terminology

* Instagram = IG

---

## Description

REST API intended to integrate with Meta's API in order to retrieve Instagram posts and related data.

The API should also be prepared to receive events from Instagram, such as new publications and notifications.

The primary objective of this project is to learn how software development agents operate on a real-world project.

---

## Initial Features

* Provide a REST endpoint capable of retrieving an Instagram post through the Meta API.
* Secure the API.

---

## Future Features

* Webhook capable of receiving Instagram publication events.
* ~~Persist received or retrieved events using the most cost-effective and efficient storage strategy.~~ ✅ (Phase 4)
* ~~Manage post persistence:~~

  * ~~The first time a post is requested each day, verify through the Instagram API whether it still exists.~~
  * ~~If the post no longer exists, stop persisting it.~~
  * ~~If it still exists, update its last verification date.~~ ✅ (Phase 5)
* Optimize storage of multimedia content associated with Instagram posts.

---

## Constraints

* Keep the project small.
* Avoid unnecessary dependencies.
* Favor clarity over complexity.

---

## JavaScript and Node.js

Target version:

Node.js 24

Rules:

* Keep functions small.
* Add useful docstrings.
* Do not add redundant comments.
* All tests must be located in the tests/ directory.
* Use PNPM instead of NPM.

---

## AWS Cloud

Rules:

* region: eu-west-1
* naming: nombre del proyecto "IG-API" o si no se pueden usar "-" entocnes "IG_API"
* Everything must be cost-effective.
* Prioritize the principle of least privilege.
* Always target zero cost whenever possible.
* Warn and request approval before introducing anything that may incur costs.
* Prefer serverless services.

---

## GitHub

Rules:

* Source code repository.
* CI/CD platform using GitHub Actions.
* All credentials, tokens, and sensitive identifiers must be stored in GitHub Secrets.

---

## Infrastructure as Code

Target technology:

AWS CDK

Rules:

* The user is a beginner with AWS CDK, although they understand the concepts.
* Explain new implementations in detail.
* Keep AWS infrastructure simple and easy to understand.

---

## Desired Structure

src/
tests/
docs/
infra/
scripts/
tools/
.github/

---

## Learning Objective

During development the agent should:

* Analyze the project before acting.
* Create files when necessary.
* Explain important decisions.
* Maintain architectural consistency.

The user is learning how software development agents work and prefers small, iterative changes.
