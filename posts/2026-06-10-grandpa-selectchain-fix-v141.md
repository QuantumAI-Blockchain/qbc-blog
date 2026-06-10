---
title: "Finality, part two: the GRANDPA liveness edge, root-caused and fixed"
slug: "grandpa-selectchain-fix-v141"
date: "2026-06-10"
author: "blockartica"
excerpt: >
  The residual GRANDPA finality edge we flagged with runtime v140 is now
  root-caused and fixed in the node's chain-selection layer, deployed across
  all three validators. Runtime v141 ships behaviour-identical cleanup. The
  fix is live; the proof is still pending.
tags: ["engineering", "consensus", "ops"]
status: "published"
read_time_min: 7
---

When we shipped runtime v140 we were explicit that it closed one stall class and not the other. The proof-hash counter desync was fixed at the source; a separate, rarer GRANDPA round and chain-selection edge that could briefly freeze finalization was left as "active work," contained by a watchdog we described as "defense in depth, not a cure." This post is the follow-up: that edge is now root-caused, and the fix is deployed across all three validators on the live mainnet (chain 3303, mainnet-fork). Runtime `spec_version` is now `141`.

The honest headline up front: the fix is **live fleet-wide but not yet proven**. It addresses the exact failure path we captured, and it is strictly a stability change — worst case it costs one round of finality progress, never a wedge — but the load-bearing confirmation only comes when the next natural stall condition exercises the new path and finality self-heals without the watchdog. We are watching for that, and the watchdog stays armed until it lands.

## What was actually stalling

This was not the proof-hash class. We confirmed that on the live chain: `RecentProofHashCount` was healthy, set-id and session rotation were clean through the freezes, and the failure reproduced on both network backends. With `grandpa=debug` enabled on the voters, the trail was finally decisive.

After a clean round completes — prevotes and precommits 3 of 3, a block finalized — the voter goes to construct the prevote for the next round. To do that, GRANDPA asks the node's chain-selection logic for the best chain that still contains the last-finalized block. Our chain-selection implementation (`WeightedChain`, in `node/src/weighted_chain.rs`) walks the leaves of the block graph by accumulated weight to answer that. The problem:

```
grandpa: Constructing prevote for round N
grandpa: Finding best chain containing block 0xf4d5…(last finalized)
grandpa: Encountered error: couldn't find best block:
         Chain lookup failed: UnknownBlock: 0xa49e…
grandpa: Could not cast prevote: previously known block 0xf4d5… has disappeared
```

A leaf that the selection walk referenced had been reorged or pruned out of the database between rounds — an `UnknownBlock`. The original code treated that as a hard error. So chain selection returned no target, the voter cast no prevote, the round could not complete, and finalization wedged — while block production kept advancing the best head, which is exactly the widening best-to-finalized gap the watchdog was catching. Any voter restart cleared it, because a restart re-reads the leaf set from a consistent state. That is why the "decisive" restart rung appeared to move around between incidents: it was never a specific node, it was whichever restart first re-established a resolvable best chain. The class is a **chain-selection / leaf-availability race, not Byzantine voting** — no equivocation, no malicious validator, just a transient view of a pruned leaf surfacing inside the voting path.

## The fix

All of it is in the node's `WeightedChain::finality_target`, the custom chain-selection path that threw the error. No runtime or consensus-rule change — this is node software, which is why earlier runtime work could not have addressed it. Three behaviours, layered:

1. **Skip unresolvable leaves instead of erroring.** A leaf whose chain back to the finalized base cannot be loaded (the missing-block case) is skipped, not treated as fatal. The walk continues to the next-best leaf.
2. **Advance via the next-best intact leaf.** Rather than collapsing straight to "make no progress," selection advances finality along the best leaf whose ancestry to base is actually complete. Finality keeps moving forward, just along a leaf that resolves.
3. **Fall back to the last-finalized base only as a floor.** If *no* leaf has an intact chain to base, selection votes for the last-finalized block itself — always a valid, loadable target. That round makes zero progress but the voter still casts a prevote, the round completes, and the next round retries with a fresh view. A no-op round, never a wedge.

The discipline that makes this safe is error classification. An early version of the fix swallowed *all* errors and fell back, which would have masked a genuine database or I/O fault as a benign "stale leaf, skip it." Off-author review caught that (we track it as F-001 / F-V2-001), and the shipped code falls back **only** on the missing-block class — `UnknownBlock` and missing-header — and propagates everything else loudly. A real backend fault now surfaces as a real fault; only the transient pruned-leaf case is handled gracefully.

The change landed across four commits in [`qubitcoin-node`](https://github.com/QuantumAI-Blockchain/qubitcoin-node): the keystone graceful fallback (`c219e79c`), the error-classification fix from review (`84c57a3d`), the next-best-leaf advancement (`e19618e8`), and the fault-visibility fix (`e441dab7`, now the deployed head).

## Runtime v141

Shipped alongside, and deliberately boring: `spec_version 140 to 141` clears deprecated `RuntimeEvent` and `ConstantWeight` usages ahead of an upcoming Substrate bump (`c387d42f`). It is **behaviour-identical** — verified the strongest way we have, with try-runtime against live state showing the storage root unchanged before and after the upgrade. `CodeUpdated` finalized cleanly on all three validators with no pause in finality through the upgrade block. There is no functional change to find here, and that is the point: warning-hygiene and forward-compatibility work that does not move state should prove it moves no state.

## How it was rolled out

One validator at a time, never dropping below a two-of-three voting quorum:

- The node binary was built once, checksummed, and the same artifact deployed to each validator (`sha256 136fd6df…008fc5a5d011`).
- Each validator was upgraded individually — replace the binary, restart, confirm the node rejoins, votes, and finalizes — before moving to the next.
- Finality held a 2-to-3 block gap throughout every restart. No stall was induced by the rollout itself.
- The previous binary is pinned on each host for a single-step rollback.

All three voters now run the same head with the fault-visibility logging live, so if the fallback ever fires it is observable on every node, not just one.

## How to verify yourself

```bash
# Runtime is v141
curl -s -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"state_getRuntimeVersion","params":[],"id":1}' \
     http://localhost:9944 | jq .result.specVersion
# -> 141

# Best height advances; finalized tracks a few blocks behind (small, steady gap)
curl -s -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"chain_getFinalizedHead","params":[],"id":1}' \
     http://localhost:9944
```

The chain-selection fix is in [`node/src/weighted_chain.rs`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/node/src/weighted_chain.rs); the `finality_target` function and its leaf-walk fallback are the relevant section.

## What we cannot claim yet

We will not call this stall class closed on a clean stretch alone. The previous, partial version of this fix ran for hours without the fallback ever engaging — and then the wedge still happened, because that version did not cover the precise path that fails. "No stalls lately" is not proof; it is the absence of an exercise. The real signal is the fallback line firing — selection hitting a pruned leaf, skipping or flooring it, and finality continuing **without** a watchdog restart. Until we have observed that, the honest status is: root-caused, fixed in the right layer, deployed fleet-wide, validation pending. The finality watchdog remains armed as the backstop in the meantime.

The rest of the path to a thousand-node chain is unchanged from the v140 post and still stated plainly: prove at real scale (100 to 1000 nodes, the number-one gap), wire the autonomous verified-slashing submitter, re-key sudo off `//Alice` to operator-held keys, and complete an external security audit before any value-bearing launch.

The chain is healthier than it was yesterday. The liveness edge that kept it watchdog-dependent now has a fix in the layer that was actually wedging. We will report again when a real stall condition proves it — or when it doesn't.

Posted by BlockArtica.
