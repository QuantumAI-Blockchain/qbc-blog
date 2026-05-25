---
title: "Aether Mind v7.0: the first model we can put real numbers on"
slug: "aether-mind-v7-real-benchmarks"
date: "2026-05-26"
author: "blockartica"
excerpt: >
  v7.0 drops the custom v6 architecture and rebuilds on Qwen2.5-7B with a
  QLoRA fine-tune on the Aether corpus. It holds general capability (MMLU
  69.9, GSM8K up 3.6 points) while cutting Aether-domain perplexity 44%.
  Every number is from lm-evaluation-harness and reproducible from the model card.
tags: ["aether", "release", "engineering"]
status: "published"
read_time_min: 6
---

For the last three model releases we were honest about something: the numbers
weren't real. v6.0 through v6.2 were pipeline releases. They proved the
training loop, the on-chain epoch finalisation, the checkpoint pinning — but
the model itself scored near uniform-over-vocabulary on held-out text. We said
so at the time: "we shipped the pipeline, not the model."

Today that changes. **Aether Mind v7.0 is the first Aether model with
benchmark numbers that are real, reproducible, and independently verifiable.**
It is live on Hugging Face:

```
QuantumAI-Blockchain/aether-mind-v7.0
https://huggingface.co/QuantumAI-Blockchain/aether-mind-v7.0
```

## Why we walked away from the v6 architecture

The v6 line was a custom 558M-parameter generator: Natively Sparse Attention
with 10 Sephirot heads plus generalist and sink heads, distilled from a frozen
Qwen2.5-0.5B teacher. The idea was to bake the 10-domain cognitive structure
directly into the attention mechanism.

When we finally ran it through a proper evaluation harness instead of just
watching the training loss, the result was unambiguous. The student's held-out
cross-entropy was about 16 nats per token. Uniform random guessing over the
vocabulary is about 11.9. The Qwen2.5-0.5B base it was distilled from sits
around 2.9. In other words, replacing standard attention with the custom
Sephirot/NSA construction did not add structure — it destroyed the base
model's capability and produced something worse than a coin flip.

That is a hard thing to publish, but it is the correct finding. The lesson is
narrow and useful: the 10-domain structure belongs in routing and in the
training data, not in a from-scratch replacement of a mechanism that took the
field a decade to get right. So v7 starts from a base that already works.

## What v7.0 is

v7.0 is a QLoRA fine-tune of `Qwen/Qwen2.5-7B-Instruct`:

- 4-bit NF4 base, LoRA rank 16 / alpha 32 on all linear projections
- trained on `aether-curated-v3` (70,713 Sephirot-domain examples) plus a
  general instruction slice to guard against forgetting
- 1,000 steps, effective batch 8, sequence length 1,024
- about 2 hours 45 minutes on a single RTX 3080 Ti

The Aether identity comes from the data and from inference-time routing across
the 10 Sephirot domains — not from rebuilding the transformer. The adapter is
40M trainable parameters on top of a frozen 7B base.

## The numbers

Every score below is from `lm-evaluation-harness`, zero-shot, with the model
loaded in 4-bit — the same way it is served. The baseline is the unmodified
`Qwen2.5-7B-Instruct` evaluated identically, so each delta is the work of the
adapter alone.

### General capability held

| Benchmark | Base | v7.0 | Change |
|---|---|---|---|
| MMLU | 69.91% | 69.90% | flat |
| GSM8K (strict) | 71.57% | 75.13% | +3.56 |
| ARC-Challenge | 51.45% | 53.67% | +2.22 |
| ARC-Challenge (norm) | 53.92% | 55.80% | +1.88 |
| HellaSwag | 60.35% | 58.43% | −1.92 |
| HellaSwag (norm) | 78.77% | 77.48% | −1.29 |

The thing that usually goes wrong with a domain fine-tune is catastrophic
forgetting: the model gets better at your niche and worse at everything else.
That did not happen here. MMLU is flat to the second decimal, and grade-school
maths and scientific reasoning both went up. The only regression is a small
dip on HellaSwag, well inside the range you expect from a domain pass.

### Domain knowledge up sharply

To measure what the model actually learned about the QuantumAI Blockchain
domain, we held out a set of Aether examples and measured cross-entropy on the
answer tokens only. We ran the same 4-bit base weights twice — once with the
adapter active, once with it switched off — so the only variable is the adapter.

| | Cross-entropy (nats) | Perplexity |
|---|---|---|
| Base | 1.589 | 4.90 |
| v7.0 | 1.002 | 2.72 |
| Change | −0.588 | **−44%** |

A 44% drop in domain perplexity, on held-out text, is a large and real gain.
And it is not memorisation: this run saw only about a fifth of an epoch, so
roughly four-fifths of the corpus was never shown to the model, and the part
it did see was seen less than once.

So the summary is the one you want from a healthy fine-tune: **general
intelligence intact, domain knowledge nearly twice as sharp.**

## You can check our work

This is the part that matters most to us. The full model card carries both
result tables, the exact command to reproduce them, the raw harness output for
both v7.0 and the base, and the script for the domain evaluation. Run this and
you get our general-capability table:

```bash
lm_eval --model hf \
  --model_args pretrained=Qwen/Qwen2.5-7B-Instruct,peft=QuantumAI-Blockchain/aether-mind-v7.0,load_in_4bit=True,dtype=bfloat16 \
  --tasks mmlu,gsm8k,arc_challenge,hellaswag --device cuda:0 --batch_size 4
```

Drop the `peft=` argument and you get the baseline. Same machine, same
settings, nothing hidden.

## What this is not

v7.0 is a deliberately light first pass — a fifth of an epoch. It already
clears the bar we set: hold general capability, gain real domain depth, publish
numbers anyone can check. A longer full-epoch run (v7.1) will push the domain
depth further, and we will re-measure and re-publish before calling it an
upgrade. The point of v7.0 is that the floor is now honest.

## Where it sits in the stack

The model lives on Hugging Face; the chain records the bytes it was supposed to
be. That pattern does not change — what changes is that the artefact at the end
of the pipeline is now a model worth running, with a capability profile we can
state plainly and you can verify yourself.

- Model: [`aether-mind-v7.0`](https://huggingface.co/QuantumAI-Blockchain/aether-mind-v7.0)
- Previous line (deprecated architecture): [`aether-mind-v6.2`](https://huggingface.co/QuantumAI-Blockchain/aether-mind-v6.2)
- Earlier LoRA on the same base: [`aether-v5.2-lora`](https://huggingface.co/QuantumAI-Blockchain/aether-v5.2-lora)

Three releases ago we told you the numbers weren't real yet. Now they are, and
you don't have to take our word for it.
