import { randomUUID } from "node:crypto";
import type { Hex, ObserveTask } from "@relaymesh/shared";
import { urlHash } from "@relaymesh/shared";

export interface AssignedJob {
  jobId: string;
  url: string;
  urlHash: Hex;
  host: string;
  nodeId: string;
  task: ObserveTask;
  createdAt: number;
  deadlineMs: number;
  result?: { status: number; bytes: number; bodyHash: Hex; latencyMs: number; body?: string };
}

/** Ephemeral assignments (8s node deadline). Epochs persist; jobs don't need to. */
const pending = new Map<string, AssignedJob[]>();
/**
 * Completed jobs, keyed by id. takeJob() only prunes the per-node PENDING
 * lists — without this separate index, a worker polling right after its own
 * submit would purge the completed job before observers read it (race that
 * silently dropped observations). Bounded; pruned by age.
 */
const done = new Map<string, { job: AssignedJob; at: number }>();
const DONE_KEEP_MS = 10 * 60_000;
const DONE_KEEP_N = 500;

function pruneDone() {
  const now = Date.now();
  for (const [id, d] of done) {
    if (now - d.at > DONE_KEEP_MS) done.delete(id);
  }
  if (done.size > DONE_KEEP_N) {
    const drop = done.size - DONE_KEEP_N;
    const keys = done.keys();
    for (let i = 0; i < drop; i++) done.delete(keys.next().value!);
  }
}

export function assignJob(url: string, host: string, nodeId: string, task: ObserveTask, timeoutMs = 8000): AssignedJob {
  const job: AssignedJob = {
    jobId: randomUUID(),
    url,
    urlHash: urlHash(url),
    host,
    nodeId,
    task,
    createdAt: Date.now(),
    deadlineMs: timeoutMs,
  };
  const list = pending.get(nodeId) ?? [];
  list.push(job);
  pending.set(nodeId, list);
  return job;
}

export function takeJob(nodeId: string): AssignedJob | undefined {
  const list = pending.get(nodeId) ?? [];
  const now = Date.now();
  const fresh = list.filter((j) => !j.result && now - j.createdAt < j.deadlineMs + 30_000);
  const job = fresh.find((j) => !j.result);
  pending.set(nodeId, fresh);
  return job;
}

export function submitJobResult(jobId: string, result: AssignedJob["result"]): AssignedJob | undefined {
  for (const [, list] of pending) {
    const job = list.find((j) => j.jobId === jobId);
    if (job && !job.result) {
      job.result = result;
      done.set(jobId, { job, at: Date.now() });
      pruneDone();
      return job;
    }
  }
  // Already completed earlier (e.g. duplicate submit after takeJob pruned it).
  return done.get(jobId)?.job;
}

export function jobStatus(jobId: string): AssignedJob | undefined {
  for (const [, list] of pending) {
    const job = list.find((j) => j.jobId === jobId);
    if (job) return job;
  }
  return done.get(jobId)?.job;
}
