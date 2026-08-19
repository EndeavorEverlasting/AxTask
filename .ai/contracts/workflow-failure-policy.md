authorityRef: axtask.agent-authority.v1

# Workflow failure policy

A workflow failure never authorizes an unchanged retry or a higher proof claim. Preserve the smallest reproducible failure, classify its owner, and route to `axtask.failure-recovery.v1`. Rerun the failed gate first after repair. Stop when a required prerequisite, authorization, protected runtime, credential, or external operator gate is unavailable. Record the blocker and exact next executable action; do not substitute observation for implementation.
