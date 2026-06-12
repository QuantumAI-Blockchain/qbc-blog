---
title: "The training loop is the chain: how anyone with a GPU helps build Aether Mind"
slug: "distributed-training-loop-cli"
date: "2026-05-26"
author: "blockartica"
excerpt: >
  Frontier models are trained by a handful of companies on hardware nobody
  else can touch. QBC turns that around: run the client, contribute your
  GPU, and every epoch that improves the model pays out in QBC. How the
  loop works and why the incentives hold.
tags: ["aether", "training", "incentives"]
status: "published"
read_time_min: 7
---

Training a large model is, today, a private act. A few companies own the
clusters, the data, and the weights. Everyone else gets an API key. The compute
is real and it is enormous — and almost all of it sits behind one door.

QuantumAI Blockchain is built on a different bet: that the same work can be
**distributed across thousands of ordinary machines and paid for in the open**.
You run a client, it puts your GPU to work improving a shared model, and when an
epoch of that work makes the model measurably better, the chain pays the people
who contributed. No API key. No permission. The model belongs to the network
that trains it.

This post is the honest, mechanical version of that idea: what the loop
actually does, what is live today, and why the incentives are designed to hold
as the network grows.

## The loop, step by step

The training loop is not a metaphor for the chain — it *is* a sequence of
on-chain events. One full turn looks like this:

1. **You run the client.** It joins the network and pulls the current model
   checkpoint and the live Knowledge Fabric (a sharded vector store, one shard
   per Sephirot cognitive domain, refreshed from new blocks roughly every minute).
2. **Your GPU does useful work.** The client runs reasoning cycles against the
   fabric. Each cycle produces an auxiliary training signal — per-domain
   gradients — rather than discarding the compute. This is what proof-of-thought
   means in practice: the work that secures a turn is the same work that improves
   the model, not compute spent solely to win a hashing race.
3. **You submit gradients.** Your accumulated per-Sephirah gradient buffers are
   submitted to the network with your identity attached.
4. **The network aggregates.** At the epoch boundary, contributors' gradients
   are combined by stake-weighted federated averaging into a single update,
   which is applied to the model in place. A new checkpoint is written and its
   SHA-256 is computed.
5. **The result is measured.** The new checkpoint is evaluated on a held-out
   set. The cross-entropy is recorded — the chain does not take "it got better"
   on faith.
6. **The epoch is finalised on chain.** An `AetherEpoch` record stores the
   weight Merkle root, the aggregate gradient hash, which domains contributed,
   the contributor count, the checkpoint hash, and the held-out loss. The model
   lives on Hugging Face; the chain records the exact bytes it was supposed to be.
7. **Contributors get paid.** The `RewardDistributor` contract pays QBC to the
   addresses that contributed to that epoch.

Steps 4–7 are the part most projects leave vague. On QBC they are contract calls
you can read back.

## What is live today, plainly

We hold ourselves to publishing only what we can show:

- **The reward loop is wired end-to-end and verified on-chain.** The
  `RewardDistributor` (`0x4b2928aB…`) pays out per finalised epoch; the first
  live `payEpoch` settled **0.05 QBC** to a contributor and the relay listener
  that triggers it is running in production. The rate starts at 0.05 QBC per
  epoch and is a governance parameter, not a constant baked into the code.
- **Epoch finalisation is permissionless.** Finalising an epoch, pinning a
  checkpoint, and recording its loss require a two-thirds quorum of bonded
  attester stake, a commit-reveal on the loss value, and a dispute window — not
  one privileged key.
- **The aggregation is honest about its stage.** Today the federated average is
  uniform per submitter. Robust aggregation — coordinate-wise trimmed mean plus
  Krum to reject poisoned or free-riding gradients — is specified and is the
  next step, not a finished claim.
- **It runs on a small set today.** The continuous loop runs on the current
  validator hardware. The open client that lets anyone plug a GPU into the pool
  is what we are building toward, on top of the same proven pipeline.

That last point is the crux, and we will state it directly: the pipeline is real
and the rewards are real; opening it to thousands of contributors is the
direction we are building toward, and the consensus work to support that many
participants is already underway.

## Why the incentives hold

A distributed training network only works if its incentives hold up against
participants who try to game them. Four mechanisms carry that weight:

- **You are paid for improvement, not effort.** Rewards attach to epochs that
  finalise with a valid, measured held-out loss. Submitting noise does not earn
  you anything, because noise does not survive the eval gate.
- **Stake is skin in the game.** Bonded stake weights both your influence on the
  aggregate and your standing in the network. Misbehaviour is slashable. The
  people steering the model are the people with something to lose.
- **The work is the security.** Block production already runs on VQE
  proof-of-thought. The compute that defends the chain and the compute that
  trains the model are the same compute — so honest participation is the
  cheapest strategy, not an altruistic one.
- **Everything is checkable.** Every epoch's contributor set, gradient hash,
  checkpoint hash, and loss are on chain. Rewards are a contract call against
  that record. There is no off-chain ledger to trust.

## Why this scales where a company cannot

A single company scales training by buying more of one kind of hardware in one
place. A network scales by lowering the cost of joining to near zero. Every new
machine adds compute *and* knowledge *and* a stakeholder. The marginal
contributor does not need permission, a contract, or a data-centre — just the
client and a GPU.

That is also why the consensus roadmap matters to training, not just to
finality: getting from a handful of validators to thousands of participants is
the same problem whether you are counting votes or counting gradients. The work
to make the validator set scale (dynamic, rotating authority sets, and beyond)
is what clears the runway for the training pool to grow into it.

## What it adds up to

The underlying proposition is straightforward. A model improves every epoch. A
record on chain proves that it improved and identifies who made it happen. Those
contributors are paid, in the open. At the scale of a few validators, that is a
working pipeline, which exists today. At the scale of thousands of GPUs, it
becomes something no single company can build: a frontier model owned by the
network that trained it.

Run the client, contribute the work, and earn a share of what it produces. That
is the loop, and it is already running.
