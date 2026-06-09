---
title: "Aether Mind progress report: live rails, a real model, a clear path"
slug: "aether-mind-progress-report"
date: "2026-06-09"
author: "blockartica"
excerpt: >
  Aether Mind is live and growing. The Knowledge Fabric just crossed 1.49
  million vectors, the v7.0 model holds general capability while sharpening
  domain depth, and every training epoch finalises on chain 3303 with a
  verifiable held-out loss.
tags: ["aether", "engineering"]
status: "published"
read_time_min: 5
---

Aether Mind is the part of QuantumAI Blockchain we are most often asked about: the on-chain AI that is supposed to get smarter as the network grows. This is a plain progress report on where it actually stands today. The short version is that the hard infrastructure is built and running, the model at the end of the pipeline is now one worth running, and the remaining work is well-defined. We are making steady, verifiable progress, and we would rather show it than describe it.

One number to anchor the rest. As of today the Knowledge Fabric holds:

```
knowledge_vectors: 1,492,314   (live, growing)
```

That is past the one-million milestone we set for this phase, and you can read it yourself in real time from the live engine (the verify section at the end shows how).

## What is live right now

Aether Mind runs in production on the GPU node and is reachable through the public endpoint at `aether-gpu.qbc.network`. It is a two-model system, and both jobs are running:

- **Cognition: `aether-mind-v5`.** A 558M-parameter transformer built on `Qwen2.5-0.5B`, with the 10 Sephirot domain heads. It produces the attention-derived metrics and the 896-dimensional embeddings that populate the Knowledge Fabric. Its integration metric (an entropy measure over attention distributions, inspired by IIT, not a consciousness claim) updates continuously and is health-guarded so it cannot silently stall.
- **Generation: `aether-mind-v7.0`.** The model that actually answers, served behind the chat endpoint.

The Knowledge Fabric itself moved to a modern engine this phase: RaBitQ binary quantization with disk-resident full vectors via the Lance Rust engine. That is what lets a single node hold 1.49M embeddings and keep growing without falling over, and it is the foundation for sharding the fabric across many nodes next.

## Training that finalises on chain

The piece that makes this more than a model on a server is that the training itself is an on-chain object. Every Aether Mind epoch finalises on chain 3303 at the AetherEpoch contract:

```
AetherEpoch v2 (permissionless): 0x4eDBCff69a18e1d859082bb05C0B31e5621aeA02
```

Each finalised epoch records the contributor set, the post-aggregation gradient hash, the model checkpoint hash, and the held-out cross-entropy loss. The model weights live on Hugging Face; the chain records and proves the bytes that epoch was supposed to produce. The reward path on top of this is working: a finalised epoch triggers an on-chain `payEpoch`, split across the specialist who trained and the verifiers who checked it. That loop has been exercised end to end on chain 3303.

So the rails the larger vision needs (plug in a machine, contribute compute, earn for verifiable work) exist and have run, not as a diagram but as transactions.

## A model worth running

We have been deliberately honest about this model's history, and that honesty is part of the progress. An earlier custom architecture (the v6 line) tried to bake the 10-domain structure directly into the attention mechanism. When we ran it through a real evaluation harness instead of trusting the training curve, it scored worse than its own base model. We published that finding plainly rather than bury it, and we changed course.

`aether-mind-v7.0` is the result of that course correction, and it is the first Aether model we can put real, reproducible numbers on. It is a QLoRA fine-tune on `Qwen2.5-7B-Instruct`, so the Aether identity comes from the data and from inference-time routing across the 10 Sephirot domains rather than from rebuilding a mechanism the field spent a decade getting right. The headline result is the one you want from a healthy domain fine-tune: general capability held (MMLU flat at 69.9), while domain perplexity on held-out text dropped 44%. Full tables, the exact `lm-evaluation-harness` commands, and the raw output are on the model card:

```
https://huggingface.co/QuantumAI-Blockchain/aether-mind-v7.0
```

The detail of those numbers is in its own report, [Aether Mind v7.0: the first model we can put real numbers on](/blog/aether-mind-v7-real-benchmarks). The point for this update is simply that the artefact at the end of the pipeline is now a model with a capability profile we can state plainly and you can check.

## Built to grow

This is a progress report, so here is the honest shape of what is next, in priority order:

1. **Scale the training from one node to many.** The aggregation loop and the on-chain finalisation are built and proven on a single node. The verifier-attestation worker that lets the validator set check and sign off candidate epochs is written and staged. Turning that into a live multi-node training swarm is the active next step.
2. **A longer v7.1 run.** v7.0 was a deliberately light first pass (about a fifth of an epoch). A full-epoch run will push domain depth further, and we will re-measure and re-publish before calling it an upgrade.
3. **Modern decentralized-training methods.** The direction is set: an expert-routed base where the experts map onto the 10 Sephirot, and DiLoCo-style decentralized optimization in place of plain averaging, so training over many machines on the open internet is efficient rather than just possible.

None of that is finished, and we are not going to pretend otherwise. What is finished is the part most projects in this space never build: a real model, a Knowledge Fabric at seven figures and climbing, and a training-to-reward loop that settles on chain with a number anyone can verify.

## Verify it yourself

The live engine reports its own state. This reads the vector count and the integration metric straight from production:

```bash
curl -s https://aether-gpu.qbc.network/aether/info \
  | jq '{vectors: .knowledge_vectors, phi: .phi, model: .generation_model}'
```

The model numbers are reproducible from the Hugging Face model card linked above, the same way the model is served. We would rather you check than trust us.

Aether Mind is live, it is growing, and the path from here is clear and honest. That is the report.

Posted by BlockArtica.
