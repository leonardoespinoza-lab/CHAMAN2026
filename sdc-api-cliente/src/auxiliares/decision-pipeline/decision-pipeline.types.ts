export type DecisionAggregateType =
  | 'siembra'
  | 'semilla'
  | 'lote'
  | 'establecimiento';

export type DecisionTrigger =
  | 'siembra.created'
  | 'siembra.updated'
  | 'siembra.phenology-recorded'
  | 'semilla.science-updated'
  | 'lote.science-updated'
  | 'establecimiento.weather-source-updated'
  | 'dispositivo.created'
  | 'dispositivo.updated'
  | 'dispositivo.deleted'
  | 'fieldclimate.assigned'
  | 'reconciliation';

export interface DecisionEnqueueOptions {
  trigger: DecisionTrigger;
  changedFields?: string[];
  sincronizarClima: boolean;
  operationId?: string;
}

export interface DecisionEventV1 {
  schemaVersion: 1;
  eventId: string;
  idempotencyKey: string;
  trigger: DecisionTrigger;
  aggregate: {
    type: DecisionAggregateType;
    id: string;
  };
  changedFields: string[];
  impact: {
    sincronizarClima: boolean;
    reconstruirSanidad: true;
    evaluarAgroclima: true;
  };
  occurredAt: string;
}

export interface DecisionScopeJobData {
  event: DecisionEventV1;
  scope: {
    type: Exclude<DecisionAggregateType, 'siembra'>;
    id: string;
  };
}

export interface DecisionSowingJobData {
  event: DecisionEventV1;
  idSiembra: string;
  completedStages?: {
    clima?: string;
    sanidad?: string;
    agroclima?: string;
  };
}
