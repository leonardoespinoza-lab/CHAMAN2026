import {
  DECISION_PIPELINE_CONCURRENCY,
  DECISION_PIPELINE_JOB_TIMEOUT_MS,
  REDIS_DECISION_QUEUE,
} from '../../env';

export const DECISION_PIPELINE_QUEUE = REDIS_DECISION_QUEUE;
export const EXPAND_DECISION_SCOPE_JOB = 'expand-decision-scope';
export const RECOMPUTE_SOWING_JOB = 'recompute-sowing-decision';

export const DECISION_JOB_OPTIONS = {
  attempts: 8,
  backoff: {
    type: 'exponential' as const,
    delay: 5_000,
  },
  timeout: DECISION_PIPELINE_JOB_TIMEOUT_MS,
  removeOnComplete: 1_000,
  removeOnFail: 500,
};

export const DECISION_WORKER_CONCURRENCY = DECISION_PIPELINE_CONCURRENCY;
export const DECISION_LOCK_TTL_MS = DECISION_PIPELINE_JOB_TIMEOUT_MS + 60_000;
