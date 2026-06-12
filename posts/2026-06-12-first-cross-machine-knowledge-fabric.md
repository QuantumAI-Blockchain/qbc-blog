---
title: "The knowledge fabric goes multi-machine: first cross-node RAG, proven live"
slug: "first-cross-machine-knowledge-fabric"
date: "2026-06-12"
author: "blockartica"
excerpt: >
  Aether's knowledge fabric just answered its first search across two
  machines: content that existed only on the other box, carried over
  libp2p, deduplicated by content-addressed id. 14/14 harness checks
  passed. What was built, what was proven, what is still missing.
tags: ["engineering", "aether", "distributed-fabric"]
status: "published"
read_time_min: 7
---

Until this week, Aether's knowledge fabric lived in one process on one
machine: ten Sephirot domain shards, about a million vectors, all of it
behind a single box's RAM ceiling. That ceiling is the single biggest
obstacle between the current system and the goal we keep restating: a
frontier model whose knowledge, training, and inference are spread across
thousands of nodes that nobody individually owns.

This post covers the first load-bearing step out of that box. Two machines,
each holding domains the other does not have, now answer each other's
searches over libp2p. The result comes back with a content-addressed id that
is identical on every node that holds the same content, so merged results
deduplicate exactly. We proved it twice: once with two processes on one box,
and once for real, between our Intel workstation and the DigitalOcean
droplet that runs the public frontend, across the network.

## Why sharded retrieval first

The distributed fabric plan has three axes: sharded knowledge (RAG),
distributed training (DiLoCo-style outer gradients finalized on-chain), and
distributed inference (transformer layers split across peers' VRAM, the
Petals design). We sequenced retrieval first for a blunt reason: it is the
axis currently pinned against a hard resource limit in production. The mind
process runs close to its memory cgroup ceiling, and most of that working
set is the fabric. Sharding domains across nodes is not an optimization, it
is the only durable relief.

## What was built

Three pieces, each landed and tested separately over the past two days.

**Content-addressed identity (phase B0).** Every vector's id is now derived
deterministically from its domain and a hash of its content, instead of a
local insertion counter. Two nodes that ingest the same passage compute the
same id without coordinating. This is the keystone the rest leans on: it is
what makes cross-node deduplication exact rather than heuristic, and it is
what lets per-domain Merkle roots mean the same thing on every replica.

**A wire protocol on the existing mesh.** The petals libp2p layer we built
for future distributed inference already had request-response plumbing and
gossipsub topics. Knowledge search reuses it: a `KnowledgeShardAdvert`
gossip message announces "I hold domain N, here is my per-domain content
root and vector count," and a `KnowledgeSearch` request carries a query
embedding to a peer, which answers from its local shards with scored,
content-addressed hits.

**The hook into the live search path.** The mind's `search_all` now has a
remote seam. When the petals runtime is enabled, a search fans out to every
peer advertising knowledge domains, merges remote hits with local ones,
deduplicates by id, and returns the top results. The serve side answers
only from its own shards, never re-fanning out, so a query cannot recurse
across the mesh. Nodes republish their adverts on a timer, so a peer that
joins late still learns who holds what.

## What was proven

We do not call something done because it compiles. The harness
(`scripts/ops/test-fabric-b1.sh`) builds two fabric nodes with strictly
disjoint domains: node A holds Sephirot domains 0 through 4, node B holds
5 through 9, and one document is deliberately seeded on both sides to test
deduplication. Then it asserts, in order: each node holds only its assigned
domains, adverts propagate in both directions, a search on A returns
content that only B holds (and vice versa), every returned hit carries a
well-formed content-addressed id, and the shared document comes back as
exactly one merged hit.

Local rehearsal, two processes on one box: 7 of 7 checks passed. Then the
real one. The harness shipped the release binary to the droplet, started a
temporary node there (model load took 10 seconds), and ran the same
assertions across the actual network:

```
PASS: P5 node A sees B's knowledge adverts (domains 5-9)
PASS: P5 node B sees A's knowledge adverts (domains 0-4)
PASS: P6 A->B: node A returned B-only domain-7 content w/ content-addressed id
PASS: P6 B->A: node B returned A-only domain-2 content w/ content-addressed id
PASS: P7 dedup: replicated d4 doc -> exactly 1 hit (same id local+remote)
=== RESULT: 7 passed / 0 failed (mode=droplet) ===
```

A query embedded on the Intel box found a passage that existed only on a
server in another country, ranked it against local results, and returned it
with an id both machines independently agree on. That is the distributed
knowledge fabric working, not planned.

The droplet node was a temporary test process with its own data directory,
torn down by the harness afterward. The droplet's production duties
(validators, frontend) were untouched throughout, and chain finality never
wobbled.

## The peer review that made it better

One detail worth being transparent about, because it is exactly why we run
a multi-machine review loop between our development agents. The first
version of the routing code trusted the peer id string inside the advert
payload, a field the sender simply claims. Our desktop reviewer flagged it:
any node could publish an advert naming someone else's peer id and divert
search traffic. The fix landed the same day. Adverts are signed at the
gossipsub layer, so the receiver now binds every advert to the
cryptographically verified author and discards the self-reported string.
The test suite now includes a spoofed advert that asserts the authenticated
identity wins.

## What is honestly not done

The production mind on the Intel box now runs with the mesh enabled, but it
is a mesh of one until permanent peers join; the droplet node in the proof
was deliberately temporary. An advert's content root and vector count are
still unauthenticated claims by the author: binding them to deposits,
serving receipts, and rewards is the next phase (B2), for which the
on-chain shard registry pallet is already written and tested but not yet
wired into the runtime. Replication is R=1 per domain in practice, there is
no Byzantine acceptance of per-domain roots yet (that is phase C, which
rides on the consensus track), and remote search adds network latency that
we have bounded with per-peer timeouts but not yet optimized.

## What this unlocks

The ceiling that mattered is gone in principle: fabric capacity now scales
with the number of nodes willing to hold a domain, and the on-chain trust
spine (per-domain roots today, BFT acceptance and serving rewards next)
is what turns "willing nodes" into a permissionless market. The same mesh,
protocol, and identity machinery carries the next two axes: distributed
training exchange and, eventually, inference on models too large for any
single participant. One box stopped being the limit this week. The next
posts in this series will be about making that true for training and
serving too.
