---
title: "V121, four bonded validators, and Aether-Mind on GPU"
slug: "v121-four-validators-aether-on-gpu"
date: "2026-05-22"
author: "blockartica"
excerpt: >
  Substrate runtime v121 finalised on chain 3303 today in a single block.
  Four validators are bonded via qbcStaking. The AuraValidatorSet trait
  now reads the live staking set. Aether-Mind runs on the RTX 3080 Ti at
  10-second warm-up and 504 ms chat latency.
tags: ["engineering", "consensus", "phase-3", "release", "aether"]
status: "published"
read_time_min: 7
---

Substrate runtime v121 landed on chain 3303 in a single block this afternoon. The code change is small: thirty lines in `runtime/src/lib.rs`. The on-chain effect is large. The `MinAuthoritySetSize` floor that blocked the election pallet drops from 10 to 4, the four validators bonded earlier today get elected with `qbcElection.submit_elected_set(era=0, [alice, bob, charlie, dave], total_stake=40_000 QBC)`, and the `AuraValidatorSet` trait that gates QVM-anchor, Aether-anchor, and model-registry submissions now reads the live bonded set instead of the hardcoded Aura authorities. The chain is permissionless at the runtime-read level for the first time.

Commit `920bcbc7` on `presale/v1` pushed to `origin`, `qai-aether`, and `qai-substrate`. WASM artefact 479,551 bytes, SHA-256 `241d1fd61c101ad415cc443e39e06e4531fc54bd6195b6df959665449a66ae35`.

## What was missing before v121

Two interlocking things.

First, `pallet-qbc-election::submit_elected_set` had a `MinAuthoritySetSize = 10` floor. The chain has had three Aura validators (Alice, Bob, Charlie) for months. The election pallet would reject any submitted set below the floor with `InsufficientCandidates`. We could bond candidates in `pallet-qbc-staking`, but there was no way to actually elect them.

Second, the `AuraValidatorSet` trait that other pallets depend on (qvm-anchor for state-root submissions, aether-anchor for attention attestations, model-registry for checkpoint attestations) read its set from `pallet_aura::Authorities`. That storage was populated at genesis with a hardcoded three-validator set. New bonded candidates never appeared there. Even if you bonded fifty validators tomorrow, the pallets that gate on validator identity would still see only the original three.

V121 cuts through both. The floor drops to four, matching what we have. The trait now reads `pallet_qbc_staking::Validators::iter_keys()`. Whoever bonds and validates is in the set the gating pallets see.

## The runtime change

Three edits in `substrate-node/runtime/src/lib.rs`. The full diff is 18 insertions, 7 deletions.

```rust
// spec_version 120 -> 121
spec_version: 121,

// MinAuthoritySetSize 10 -> 4
pub const QbcMinAuthoritySetSize: u32 = 4;

// AuraValidatorSet rewired to read the live bonded set.
// Falls back to the legacy Aura authorities if staking is empty,
// so qvm-anchor / aether-anchor / model-registry keep accepting
// submissions through any transient state at the upgrade boundary.
impl frame_support::traits::Get<Vec<AccountId>> for AuraValidatorSet {
    fn get() -> Vec<AccountId> {
        use sp_runtime::traits::IdentifyAccount;
        let bonded: Vec<AccountId> =
            pallet_qbc_staking::pallet::Validators::<Runtime>::iter_keys().collect();
        if !bonded.is_empty() {
            return bonded;
        }
        pallet_aura::Authorities::<Runtime>::get()
            .into_inner()
            .into_iter()
            .map(|aura_id| {
                let inner: sp_core::sr25519::Public = aura_id.into();
                sp_runtime::MultiSigner::Sr25519(inner).into_account()
            })
            .collect()
    }
}
```

The fallback to the legacy Aura set matters. If the staking map is unexpectedly empty for a few blocks around the upgrade (because of state migration timing, or because someone calls `chill` then re-bonds), the dependent pallets shouldn't reject everything. The fallback gives a safe transition path.

That is the entire substantive change. WASM rebuilt, sudo submitted `system.setCode(<wasm>)` via `//Alice`, the upgrade finalised in one block.

## Why this v121 is not an Aura-to-BABE swap

The original plan called for the full Aura-to-BABE engine swap as part of v121: replace `pallet-aura` with `pallet-babe`, add `pallet-session`, write an `OnRuntimeUpgrade` migration to kill Aura storage and seed BABE state, modify `node/src/service.rs` to use BABE's block import. Four to eight hours of careful Rust work with real chain-halt risk if migration is wrong.

Reading the runtime carefully changed my mind. The chain's `pallet_timestamp::Config::OnTimestampSet` is set to `()` with the comment "VQE mining controls block timing, not Aura slots. Blocks are authorized by VQE proofs, not Aura authority signatures." The real block production engine is `pallet-qbc-consensus` plus VQE mining via the `--mine` flag. Aura is a name registry, decorative in this architecture. There is no standard `pallet-session` in the runtime; a custom `pallet-qbc-session` sits at index 14 and would conflict with the standard one without architectural redesign.

A BABE engine swap in this chain would be ceremony, not function. BABE's VRF slot leadership doesn't matter when VQE already controls block production. The genuine permissionless step is the validator-set read path. That is what shipped.

The full BABE question stays open for v122 or later, if and when there's a real reason for VRF slot leadership replacing VQE-mining-as-Sybil-resistance. It's a multi-day architectural decision, not a code change.

## Four bonded validators in one session

Yesterday evening a fourth validator (Dave) came up on the desktop WSL2 host (Tailscale `100.80.115.96`, host `desktop-en71kfg`). The chain database was snapshotted from Bob via `tar`, transferred over the Tailscale mesh, and extracted into `~/.qbc-substrate-dave/chains/qbc_mainnet_fork/`. Dave's `qbc-node --validator --disable-block-authoring` came up, found Alice and Bob and Charlie via the Tailscale bootnodes, and synced to chain tip in under five minutes.

Today the four validators bonded one after another via a small `@polkadot/api` Node script running on the droplet. Alice and Bob already had ample QBC from genesis (about 11.5 billion each per the premine). Charlie had zero balance and was funded with 10,100 QBC from Alice first. Dave had been funded with 10,001 yesterday for his test bond, then topped up with another 10 QBC margin after the bond locked 10,000 of his 10,001 (the bond fee left his free balance below the lock floor; the next `validate` extrinsic couldn't pay its own fee until the top-up landed).

After v121's floor drop, `submit_elected_set` accepted all four candidates. The on-chain event:

```
qbcElection.Elected {
  era: 0,
  validatorCount: 4,
  totalStake: 4_000_000_000_000
}
```

`LastElection` storage shows the four QBC-SS58 addresses (custom prefix 88, which is why they don't look like the substrate-default `5...` form):

```
esqZdrqhgH8zy1wqYh1aLKoRyoRWLFbX9M62eKfaTAoK67pJ5   (Alice)
esozUamXY9R14rwM3G5cPaTX1haVSo47orFtKGJSn6pPrLvwD   (Bob)
esp38ewfaUQthVYkhnsCia7yJXiApnMzfH39eoJjtPDaNdn8f   (Charlie)
eso5GWRocxVgwV17pcdrYVGH7xvcp2SZix8JHxJobntjnqNwZ   (Dave)
```

Each bonded with 10,000 QBC at 5% commission (`commission_per_billion = 50_000_000`). The on-chain QVM-anchor and Aether-anchor pallets see these four addresses via `AuraValidatorSet::get()` from this block onward. Any new bonded candidate would appear there too without a code change.

## The Aether-Mind wedge that ate the morning

The Aether-Mind service on Intel has had a recurring HTTP-wedge pattern for two days. Every few hours the listener would still report `LISTEN` on port 5003, but `/health` would time out. The accept queue grew to hundreds of unanswered connections. CLOSE-WAIT sockets piled up by the hundreds with kilobytes of unread data per peer. Memory swap usage on the cgroup climbed past 6 GB. Restart cleared it for 45 minutes the first day, eight hours the second.

I'd patched two things yesterday: a bounds check on `total_params` in the gradient submission handler (anti-OOM allocation cap), and a raised FedAvg trigger threshold from `n>=2` peers to `n>=8` (amortise dense-Vec allocations). Plus a cgroup bump from `MemoryHigh=2500M` to `3500M` and `MemorySwapMax=6G`. The chronic recurrence kept happening. Memory was the wrong hypothesis.

Looking at the live process state told the real story. Threads were in `futex_wait_queue` on tokio worker handles, not in allocation. The wedged HTTP server held a fixed worker pool. A few tasks elsewhere in the process were holding those workers in pure CPU work for seconds-to-minutes per iteration, never yielding to the runtime. While they ran, no HTTP handler could run.

The first offender was the contrastive embedding training loop. Every fifty blocks it called `trainer.train_step(anchors, positives, negatives)` directly inside an async task, holding the trainer mutex across the await. `train_step` does a forward + backward + optimizer step on a 558.5M-parameter candle model. On CPU that takes seconds to minutes. While running, the tokio worker was pinned, the mutex was held, and any other code path wanting the trainer or wanting a worker had to wait.

Fix: move the training step into `tokio::task::spawn_blocking`. That has a distinct thread pool from the runtime workers. CPU work there doesn't compete with HTTP serving. The trainer gets moved into the blocking task and moved back into the mutex on completion. Commit `05bbf08a`.

The same anti-pattern existed in five more places: the `POST /aether/chat` handler's `model.forward()` + `compute_phi()`, the `GET /aether/pot` handler's `tracker.evaluate()`, the Aether-Evolve NAS background loop, the background fitness evaluator that runs every five minutes, and the `POST /aether/evolve/mutate` handler. All five now run their CPU-bound work in `spawn_blocking` with `blocking_lock()` on the tokio mutexes. Commit `6a711ef0`.

Then Intel's RTX 3080 Ti.

The build had a `--features cuda` flag but it was never enabled. CUDA toolkit 12.6 was installed but `nvcc` wasn't on PATH. Adding `export PATH=/usr/local/cuda/bin:$PATH` and rebuilding with `cargo build --release --bin aether-mind --features cuda` produced a 26.3 MB binary linking `libcuda`, `libcurand`, `libcublas`, and `libcublasLt`. A systemd drop-in at `/etc/systemd/system/qbc-aether-mind.service.d/cuda.conf` set `Environment=AETHER_DEVICE=cuda`. The candle backend's device selector picked it up on restart.

The numbers from the rebuilt, GPU-enabled, spawn_blocking-fixed service:

| Signal | Before | After |
|---|---|---|
| Warm-up to /health=200 | 9 to 30 minutes | 10 seconds |
| Process RSS at steady state | 3.5 GB or more | 677 MB |
| Cgroup swap usage | 7 GB or more | 0 |
| /aether/chat latency (forward + phi + RAG) | seconds | 504 ms |
| HTTP accept queue backlog | 485 unanswered | 0 |
| CLOSE-WAIT socket pile | hundreds | 0 |
| Chronic re-wedge | every 45 min to 8 hours | not observed |

The model weights now live in VRAM. The process RSS is mostly just buffer space and the tokenizer. `nvidia-smi` shows the aether-mind PID alongside Ollama as a CUDA compute context, sharing the 12 GB card with about 6.5 GB of headroom.

## Verify yourself

Three commands.

Confirm the runtime is at v121:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","method":"state_getRuntimeVersion","params":[],"id":1}' \
     https://qvm.qbc.network/jsonrpc | jq .result.specVersion
# 121
```

Confirm the four bonded validators are in the staking set (requires a Substrate RPC, not the QVM RPC). Point a local `@polkadot/api` script at `wss://api.qbc.network` and iterate `qbcStaking.validators.entries()`. Four entries, one per validator.

Confirm Aether-Mind is on the GPU on Intel (this requires shell access to the GPU host):

```bash
ssh intel-host 'nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv'
# expect aether-mind PID listed
```

## What's next

GRANDPA finality is fragile in the current 2-of-2 hardcoded authority configuration. Today it stalled briefly with a 4,200-block lag before an Alice restart unstuck it. Adding Charlie and Dave to the GRANDPA authority set requires another runtime upgrade, and it's the right next move before any public traffic. That's a candidate for v122.

The desktop validator's WSL2 host still has `vmIdleTimeout=60000` (the 60-second default) in `.wslconfig`. Long-running validator processes risk a host-side suspend during idle moments. The fix is `vmIdleTimeout=-1` plus `wsl --shutdown` from PowerShell to apply, paired with a Windows power plan that won't sleep. Housekeeping for tomorrow.

The BABE engine swap stays open as v122 or later if and when there's a real reason for VRF slot leadership replacing VQE-mining-as-Sybil-resistance. Today's v121 doesn't require it.

A bigger public-facing announcement comes after GRANDPA hardening and the host stability fixes land. The chain is now genuinely more permissionless than yesterday; calling it that to a wider audience needs the supporting infrastructure to be boring rather than fragile.

— BlockArtica
