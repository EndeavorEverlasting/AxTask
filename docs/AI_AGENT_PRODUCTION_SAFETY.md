# AI Agent Production Safety

## Purpose

AI agents and automation tools must not have unchecked destructive authority over AxTask production systems.

## Forbidden

AI/agent workflows must not receive:

- production `DATABASE_URL`
- backup delete credentials
- provider project admin credentials
- object storage admin/delete credentials
- migration operator credentials
- production shell access capable of purge/migration without human approval

## Restricted Commands

The following commands must be blocked or guarded in production-like environments:

- `db:push`
- `db:migrate`
- `db:reclaim`
- `db:retention`
- retention prune
- hard purge
- account deletion
- backup deletion
- object storage deletion

## Required For Migration PRs

Migration PRs must include:

- schema diff summary
- preflight backup proof
- restore drill result
- rollback plan
- affected tables
- expected data impact

## Rule

Agents may draft, test, and propose. They do not get the keys to burn the kingdom.
