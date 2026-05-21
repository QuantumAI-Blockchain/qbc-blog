---
title: "Permissionless launch — runtime upgrade landed in one block"
slug: "permissionless-launch-runtime-upgrade"
date: "2026-05-21"
author: "blockartica"
excerpt: >
  Substrate runtime v120 finalised on chain 3303 at block 0x2263d190…794f35.
  Four new permissionless pallets are now queryable on the live mainnet
  alongside the existing consensus path — anyone can bond and validate.
tags: ["engineering", "consensus", "phase-3", "release"]
status: "published"
read_time_min: 4
---

The substrate runtime upgrade fired today. `spec_version 117 → 120` was
finalised in a single block (`0x2263d190ed8090d1112d1cdcbd8747a94e12a09efc3b9573ea44d12686794f35`) on the live mainnet (chain 3303, mainnet-fork), via `sudo.sudoUncheckedWeight(system.setCode(<wasm>))` signed by `//Alice`. No missed slots; GRANDPA finality continued through the cutover; the 3-validator Aura set kept authoring without a hiccup.

The WASM artifact is bit-identical to what `cargo build --release -p qbc-runtime` produces from commit `e90a1803`. SHA-256: `34a18cb33f67a79acee8e82af166dd44b9bb69f0e499d0c03043a6cc52188f3c`. 477 815 bytes. You can verify it yourself with the `sha256sum` from any clone of the repo.

## What's now live

Four new permissionless pallets are in `construct_runtime!` at indices 17–20:

- **`pallet-qbc-staking`** — anyone can `bond_stake` with ≥ 100 QBC and `validate` (with ≥ 10 000 QBC) or `nominate` up to 16 candidates. Unbonding takes 28 eras (7 days). Bonded stake remains slashable through the full window so a validator can't rage-quit on the way to an offence.
- **`pallet-qbc-election`** — `submit_elected_set` rejects authority sets smaller than `MinAuthoritySetSize = 10`. This is the safety floor that gates the eventual Aura → BABE swap.
- **`pallet-qbc-offences`** — `report_offence` accepts cryptographic equivocation proofs and unresponsiveness reports from any address. Routing into stake-side slashing wires in at the next hardfork.
- **`pallet-qbc-qvm-committee`** — `submit_state_root_signed` / `dispute_state_root` / `confirm_pending` callable now. Scaffold-ready to replace the Charlie-only QVM bridge path with a 2/3 committee + 55-min dispute window.

**Aura keeps authoring.** The new pallets sit alongside existing consensus and accept permissionless writes without disturbing block production. The next sequential step is candidate onboarding — once ≥ 10 distinct accounts bond and `validate`, the `spec_version 120 → 121` Aura → BABE hardfork becomes operationally safe.

## Why this matters

Before today, the chain had a hardcoded 3-validator authority set, a sudo-only `register_validator_key` path, and no way for an external account to participate in consensus. After today:

- Validator candidacy is a public extrinsic. No allowlist, no committee approval, no off-chain coordination.
- Slashing is a public report. Anyone with a cryptographic equivocation proof can submit it.
- L2 state-root anchoring is no longer a single-validator role. The new committee primitive lets ⌈2/3⌉ of the active set sign a state root in parallel, with a 55-minute dispute window backed by a 5 000 QBC bond.
- Governance over the Phase 2 contract stack was already permissionless after yesterday's cutover (every governor handed over to UpgradeGovernor v2; ProxyAdmin transferred with a 48-h timelock floor). Now the underlying L1 has matching primitives.

## How to verify yourself

```bash
curl -s -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"state_getRuntimeVersion","params":[],"id":1}' \
     http://localhost:9944 | jq .result.specVersion
# → 120

# Block height should advance every ~3.3s
curl -s -X POST -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"chain_getHeader","params":[],"id":1}' \
     http://localhost:9944 | jq .result.number
```

The submitter script — re-usable for future upgrades — is committed at
[`scripts/ops/submit_runtime_upgrade.mjs`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/scripts/ops/submit_runtime_upgrade.mjs).

## What's next

Three sequential gates to a full permissionless L1:

1. **Bond ≥ 10 distinct candidates** via `qbcStaking.bondStake`. Blocking on third-validator infra capacity — once a non-residential host is provisioned, candidate onboarding moves quickly.
2. **Aura → BABE hardfork** (`spec_version 120 → 121`). High-risk; this is the consensus swap. Requires all 3+ validators to have BABE session keys imported and the elected set to be ≥ 10.
3. **Universal-EOA burn.** Runbook in [`docs/EOA_BURN_RUNBOOK.md`](https://github.com/QuantumAI-Blockchain/qubitcoin-node/blob/main/docs/EOA_BURN_RUNBOOK.md). Executes only after every role rotation is on-chain-verified.

In parallel: the FROST DKG ceremony for BridgeVaultV2 (cryptographer track) and the v6.x → v7 model distillation on rented A100s (research track).

The chain's still 3-validator with single Aura authoring under the hood today. But the door is open — anyone can walk through.

— BlockArtica
