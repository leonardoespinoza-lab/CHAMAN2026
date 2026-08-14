/** Casos de referencia inmutables: cualquier cambio de decoder debe reproducirlos. */
export const MILESIGHT_UC50X_GOLDEN_FIXTURES = {
  officialAnalog: {
    source: 'Milesight UC50x Communication Protocol',
    payloadHex: '05e29a4a9a4a9a4a9a4a',
    expectedCurrentMa: 13.203,
  },
  officialSdi12: {
    source: 'Milesight UC50x Communication Protocol',
    payloadHex:
      '08db00412b302e302b302b32352e350d0a00000000000000000000000000000000000000000000',
    expectedValues: [0, 0, 25.5],
  },
  observedFieldFrame: {
    source: 'Uplink UC511 conservado por Chaman',
    payloadBase64:
      'BeKXSJdIl0iXSAjbACszNC4zMjg3NCszOS4zMDA3MiszOS45OTk4MA0KAAAAAAAAAAjbATArMzguODEyNzMrMzAuMzk1NjErMjcuODkwNzkNCgAAAAAAAAjbAjArMzcuNDg2ODkrMzUuMjQ3NjMrMzAuNTI4MjMNCgAAAAAAAAjbAzArMjcuMjYwNzErMjQuNTc2MDUrMzguMzcwNTcNCgAAAAAAAAjbBDArMTQ4Ny4wMTIrMTYxNy4zNjIrMTY2OC40MjYNCgAAAAAAAA==',
    expectedCurrentMa: 9.18,
    expectedMoisture: {
      firstDepthCm: 10,
      firstValue: 34.32874,
      lastDepthCm: 120,
      lastValue: 38.37057,
    },
    expectedVicAt10Cm: 1487.012,
  },
} as const;
