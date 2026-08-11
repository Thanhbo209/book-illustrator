# Pipeline State and Concurrency Skill

## Purpose

Protect the application from duplicate generation, lost progress,
invalid transitions, and permanently stuck steps.

---

## State Model

Separate:

1. Overall project progress
2. Current pipeline step
3. Execution state

Do not collapse everything into one status field.

A useful conceptual model is:

```text
Project:
  completedStep
  currentStep
  stepState
  stepStartedAt
  stepError
```
