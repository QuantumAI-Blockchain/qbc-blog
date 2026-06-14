---
title: "Training cycles as on-chain objects: how Aether Mind v6.2 ships"
slug: "aether-mind-v62-on-chain"
date: "2026-05-21"
author: "blockartica"
excerpt: >
  Every Aether Mind training epoch finalises on chain 3303 with the
  contributor set, gradient hash, model SHA-256, and held-out loss. v6.2
  is pinned at AetherEpoch contract 0x2EfEC3388C9A5675a41651D31619E43E782E395a.
tags: ["aether", "release", "engineering"]
status: "published"
read_time_min: 5
---

The cleanest way to explain what's different about QuantumAI Blockchain is to point at one address:

```
AetherEpoch v1:  0x2EfEC3388C9A5675a41651D31619E43E782E395a
AetherEpoch v2:  0x4eDBCff69a18e1d859082bb05C0B31e5621aeA02   (live, permissionless)
```

Every Aether Mind training epoch finalises here with a struct of:

```solidity
struct Epoch {
    uint256 epochId;
    uint256 cycleAtFinalize;       // L2 block height
    bytes32 weightMerkleRoot;      // Merkle of per-Sephirah weight buckets
    bytes32 gradientAggregateHash; // SHA-256 of the post-FedAvg aggregate
    uint16  sephirotMask;          // bit-i set ⇒ Sephirah i contributed
    uint32  gradientCount;
    uint64  finalizedAt;
    bytes32 ipfsCheckpointCid;     // currently SHA-256 of model.safetensors
    uint32  lossScaled;            // held-out CE × 1000
}
```

That last field is what makes this different from every other "AI x crypto" project. The chain doesn't claim to host the model; it claims, and proves, that **this specific epoch produced this specific model with this specific held-out loss**. The model lives on Hugging Face. The chain records the bytes it was supposed to be.

## What v6.2 actually is

[`aether-mind-v6.2`](https://huggingface.co/QuantumAI-Blockchain/aether-mind-v6.2) is a 24-layer, 558.5M-parameter native Rust+candle generator with **Natively Sparse Attention** over 10 Sephirot + 2 generalist + 2 sink heads (head_dim=64), distilled from a frozen Qwen2.5 0.5B Instruct teacher under hybrid α·KL + (1−α)·CE loss with α annealed 1.0 → 0.3 across a packed-context curriculum. BF16 weights with F32 numerical-stability casts on softmax, log-softmax, KL, and cross-entropy paths.

Held-out mean cross-entropy: **8.43 nats/token** at ctx=256.

If you know what nats/tok means: yes, this is a Phase-1 pipeline-bootstrap release, not a frontier model. Qwen2.5-0.5B-Instruct (the teacher) is at ~2.3 nats/tok on standard corpora; 8.43 is closer to uniform-over-vocab than to GPT-2-small. The honest reading is: **we shipped the pipeline, not the model**. The v6 architecture's 22K new random-init parameters (Sephirot gates, NSA branch gates) intentionally put the student off the teacher's manifold so the gates can learn meaningful routing, and 30K steps × ctx=256 × batch=1 BF16 on a single 3080 Ti is a "does it run end-to-end" budget, not a quality budget.

What v6.2 demonstrates is **the pipeline works**: deterministic Hamiltonian → SHA-256 of safetensors → on-chain pin → held-out eval → on-chain loss. Three checkpoints (v6.0, v6.1, v6.2) are pinned this way. The 7B-scale run on rented A100s is the quality target; the pipeline is the prerequisite.

## What "on-chain training cycles" means concretely

The off-chain aether-mind binary runs a continuous reasoning-cycle pump:

1. Knowledge Fabric (HNSW + RocksDB, ~190K live 896-d vectors) ingests new blocks every 60s.
2. Per-Sephirah gradient buffers accumulate from inference-time aux loss.
3. At epoch boundary, stake-weighted FedAvg over submitter gradients (the live aggregation today is uniform per-submitter, moving to coordinate-wise trimmed-mean + Krum is on the roadmap; see [`docs/MSAII_SPEC.md`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/docs/MSAII_SPEC.md)).
4. Optimizer step applies the aggregate to the V6 student weights in place.
5. New checkpoint written to `step_<N>.safetensors`; SHA-256 computed.
6. Held-out CE evaluated.
7. `AetherEpoch.finalizeEpoch(...)` writes the struct above.
8. `pinCheckpoint(epochId, sha256)` + `recordLoss(epochId, lossScaled)` record the artefact.

[`aether-v6-train --publish-on-completion`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/scripts/training/publish_checkpoint.sh) wraps steps 5–8 into a single command. The next training run is one command end-to-end.

## v2 is permissionless

Yesterday (Phase 4 cutover), `AetherEpochV2`'s kernel rotated from the deployer EOA to `AttesterRegistry`, and its governor rotated to `UpgradeGovernorV2`. Translation: the EOA `0xf39F…2266` can no longer finalise epochs, pin checkpoints, record losses, or pause the contract. Every finalisation from now on requires 2/3 of bonded attester stake + commit-reveal loss + 30-min dispute window. Anyone with ≥ 10 000 QBC can bond and start attesting.

End-state on chain 3303, verified live:

```
AetherEpochV2.kernel    = 0x8192ED55…99B1B (AttesterRegistry)
AetherEpochV2.governor  = 0x9c9A5145…7a7ac8 (UpgradeGovernorV2)
ProxyAdmin.owner        = 0x9c9A5145…7a7ac8 (UpgradeGovernorV2)
ProxyAdmin.minimumDelay = 172800            (48 hours)
```

## Verify any value yourself

```bash
# Pull the v6.2 checkpoint from HF
wget https://huggingface.co/QuantumAI-Blockchain/aether-mind-v6.2/resolve/main/model.safetensors
LOCAL=$(sha256sum model.safetensors | awk '{print $1}')

# Pull the on-chain pin
cast call --rpc-url https://qvm.qbc.network/jsonrpc \
          0x2EfEC3388C9A5675a41651D31619E43E782E395a \
          'getEpoch(uint256)((uint256,uint256,bytes32,bytes32,uint16,uint32,uint64,bytes32,uint32))' \
          <EPOCH_ID>
# The ipfsCheckpointCid field should equal 0x$LOCAL.
```

Full runbook: [`docs/REPRODUCIBILITY.md`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/docs/REPRODUCIBILITY.md).

## What this isn't

This isn't AGSI. It isn't a consciousness measurement. It isn't a SUSY computation. The MSAII number we surface at `/aether/msaii` is an attention-pattern interpretability statistic, it's useful as a diagnostic, it's not evidence of cognition. The physics renames in the latest whitepaper revision (PoVE / MSAII / PSLRS, see [`docs/PERMISSIONLESS_RESOLUTION_2026-05-21.md`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/docs/PERMISSIONLESS_RESOLUTION_2026-05-21.md) §6) are about being honest with the audiences that actually understand the underlying math.

What this **is**: the first chain where you can verify, byte-for-byte, that a published model came from the training run the chain says it did. That's a real primitive. Everything else builds on it.

,  BlockArtica
