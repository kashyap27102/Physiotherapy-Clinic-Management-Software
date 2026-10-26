## Summary

<!-- What does this change do, and why? One or two sentences. -->

## Requirements

<!-- IDs from docs/PRD.md, docs/User-Stories.md or docs/MVP-Checklist.md, for example SEC-001, AUTH-001. -->

## Type of change

- [ ] Feature
- [ ] Bug fix
- [ ] Refactor or cleanup (no behaviour change)
- [ ] Database migration
- [ ] Docs or tooling

## Changes

<!-- Short list of what changed and where. Call out new endpoints, tables, environment variables and dependencies. -->

## How it was tested

<!-- Commands run and what you checked by hand. -->

## Checklist

- [ ] `format:check`, `lint`, `typecheck`, `test` and `build` pass in every package I touched
- [ ] New endpoints enforce a permission key and have a cross-tenant test (another clinic's record answers 404)
- [ ] Migrations are new files (no edits to applied ones) and were applied to a development database
- [ ] No patient data, secrets, codes or tokens in logs, test data or commits
- [ ] UI text lives in the strings file
- [ ] Docs updated (`docs/MVP-Checklist.md`, `CLAUDE.md`, `.env.example`) where relevant

## Risks and follow-ups

<!-- Anything reviewers should look at closely, known gaps, and work deliberately left for later. -->

## Screenshots

<!-- For UI changes only. -->
