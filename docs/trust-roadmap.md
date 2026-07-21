# Clamor trusted-memory roadmap

## Foundation now implemented

- deterministic evaluation cases with expected sources;
- correct abstention when saved history is irrelevant;
- citation precision, recall, answer coverage, and unsupported-answer metrics;
- a provider-neutral workspace and permission model;
- a read-only evaluation API at `/api/evaluation`.

## Next implementation slice

1. Expand the baseline to 30–50 labeled questions covering contradictions, superseded decisions, ambiguous owners, and permission boundaries.
2. Separate workspace, message, retrieval, answer, citation, and evaluation-run persistence.
3. Add authenticated memberships and permission-aware retrieval before adding external connectors.
4. Move ingestion and summarization into retryable background jobs.
5. Record model, prompt, retrieval configuration, latency, and cost for each answer.
6. Run the evaluation suite against every provider change.

## After the backend

- deletion and permission changes propagate into the retrieval index;
- prompt-injection and hostile-message cases enter the evaluation suite;
- production errors, job failures, latency, and model cost become observable;
- one consenting community pilots digests, action items, onboarding, and cited Q&A;
- human feedback is joined to answer and citation records for later evaluation.

## Exit criteria for the mock phase

- unsupported-answer rate remains zero on the baseline;
- private content never appears for unauthorized roles;
- every generated answer has source IDs or an explicit abstention;
- evaluation output is reproducible locally and in CI.
