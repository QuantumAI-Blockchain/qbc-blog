---
title: "Runtime v140: closing the recurring finality-stall class"
slug: "runtime-v140-finality-stall-fix"
date: "2026-06-09"
author: "blockartica"
excerpt: >
  Substrate runtime v140 is live on chain 3303. It permanently fixes the
  RecentProofHashes count desync that caused the multi-hour halt at block
  343742, with the migration result verified on live state: count 999 to 0,
  invariant holding.
tags: ["engineering", "consensus", "ops", "release"]
status: "published"
read_time_min: 6
---

Runtime `spec_version 139 to 140` is finalised on the live mainnet (chain 3303, mainnet-fork). It closes a specific, recurring finality-stall class at the source: the `RecentProofHashes` count desync inside `pallet-qbc-consensus` that produced the roughly 6.5-hour halt at block 343742. The migration ran on live state exactly as the try-runtime rehearsal predicted, rebuilding the bookkeeping count from `999` down to `0` and restoring the `count == in_window` invariant.

The deploy was owner-attended on 2026-06-05 at about 09:19Z, via `sudo.sudoUncheckedWeight(system.setCode(<wasm>))` signed by `//Alice`, in block `0xac20cbaf`. On-chain code blake2 hash begins `0x4a46deae`. The deployed WASM is pinned in the repo for rollback and independent verification:

```
scripts/ops/rollback/qbc_runtime_spec140_LIVE.compact.compressed.wasm
  size:    566689 bytes
  sha256:  cc72b3687f7f530cade863854cb9be856244536d01b4bf3d16dee8aa5f6300e5
```

Finality did not blink across the cutover: 7 of 7 samples held a gap of 2 to 3 blocks through the upgrade block, with no missed slot and no halt. The chain has since advanced past block 552000.

## What was actually broken

`pallet-qbc-consensus` keeps a bounded window of recently seen mining proof hashes, plus a `RecentProofHashCount` counter and a `ProofHashOldestBlock` pointer used to prune the window. The counter was allowed to drift away from the real number of in-window entries. Over a long run the drift compounded until the prune path did unbounded work and finalization wedged. That is the failure that surfaced at block 343742 and is written up in the public incident note at [`docs/ops/halt-343742-proofhash-and-seed.md`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/docs/ops/halt-343742-proofhash-and-seed.md).

Earlier runtimes papered over the symptom with a `--wasm-runtime-overrides` patch. That was a stopgap, not a fix. v140 removes the stopgap and corrects the storage logic so the counter can no longer diverge.

## How v140 fixes it

Two parts, both in `pallet-qbc-consensus`:

1. **Prune by age, not by count.** The window is now pruned against `ProofHashOldestBlock` so the set of retained hashes is defined by the block window itself, and `RecentProofHashCount` is derived from the actual in-window entries rather than tracked independently. The invariant the runtime now enforces is `count == in_window`.
2. **A one-shot migration to repair live state.** A `VersionedMigration` rebuilds the counter from the real entries on upgrade. On the live chain that took `RecentProofHashCount` from `999` to `0` and set `ProofHashOldestBlock` from `484466` to `681471`, which is the mining tip plus one. The fix landed in commit `90843f0a`.

A unit-test pass for the migration (commit `80bcac5d`) caught a real bug before any deploy: a `clear_prefix` call that returns `0` was being read as a live count, which would have re-introduced a desync. That is exactly the kind of silent off-by-default error these tests exist to catch.

## How we verified it before shipping

- **try-runtime against live state** (commit `9d299b29`): the invariant asserts VIOLATED before the migration and HOLDS after, and the migration is idempotent on a second application.
- **45 of 45 pallet tests** green, including three new perturbation tests that advance the tip and inject a fresh miner at the tip before the migration runs.
- **Rollback pinned both ways:** `spec139_LIVE` and `spec140_LIVE` WASM artifacts are committed under `scripts/ops/rollback/` (commit `0ae6923a`), so a revert is a single `set_code` away.
- **External review:** the change was reviewed off-author and cleared before the owner-attended deploy.

## The honest part: a separate liveness edge

v140 fixes one stall class. It does not fix everything. There is a separate, rarer GRANDPA round and set-id liveness edge that can briefly freeze finalization, distinct from the proof-hash counter and not addressed by this runtime. We treat it as residual liveness work, and it is contained in two ways while we instrument the root cause:

- An automated full-voter-set finality watchdog at [`scripts/ops/qbc-finality-watchdog.sh`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/scripts/ops/qbc-finality-watchdog.sh) detects a sustained stall (finalized height frozen past a threshold with a widening best-to-finalized gap) and escalates a staggered restart of the voter set, one rung at a time, stopping as soon as finality advances. It has recovered every occurrence to date.
- The watchdog stays observable during its own cooldown and backs off after a bounded number of re-engagements, so a chronic stall produces a real "manual intervention" signal instead of silently hammering the validator set.

This is defense in depth, not a cure. Block production continues during such a stall (no data is lost), but finalization pauses, and a watchdog-dependent finalization path is not the end state. Root-causing that GRANDPA edge is active work.

## How to verify yourself

```bash
# Runtime is v140
curl -s -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"state_getRuntimeVersion","params":[],"id":1}' \
     http://localhost:9944 | jq .result.specVersion
# -> 140

# Best height advances every ~3.3s, finalized tracks a few blocks behind
curl -s -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"chain_getHeader","params":[],"id":1}' \
     http://localhost:9944 | jq .result.number

# The pinned deployed WASM matches the hash above
sha256sum scripts/ops/rollback/qbc_runtime_spec140_LIVE.compact.compressed.wasm
```

## What's next

The proof-hash stall class is closed. The residual path to a thousand-node chain is unchanged and stated plainly:

1. **Prove at real scale, 100 to 1000 nodes.** This is the number one gap. It needs real multi-machine infrastructure or a large simulated network. The current evidence tops out at 8 and 12 node scratch tests, not thousands.
2. **An autonomous verified-slashing submitter** that turns a detected GRANDPA equivocation into the on-chain deferred-slash path. The detector wiring is deep and not yet done.
3. **Re-key sudo off `//Alice`.** This is an absolute pre-launch blocker. The multisig and governance primitives are live; the destination keys belong to the operator, never to an agent.
4. **External security audit** before any public or value-bearing launch.

The runtime is healthier than it was a week ago, and the one class of halt that kept recurring is gone at the source. The rest of the list is honest about how far there still is to go.

Posted by BlockArtica.
