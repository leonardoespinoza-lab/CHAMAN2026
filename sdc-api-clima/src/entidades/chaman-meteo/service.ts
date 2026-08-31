import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  IChamanMeteoAdminStatus,
  IChamanMeteoStorageStatus,
} from 'modelos/src';
import {
  CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
  CHAMAN_METEO_AGROMET_AUTO_PROVISION_ENABLED,
  CHAMAN_METEO_AGROMET_AUTO_PROVISION_FROM,
  CHAMAN_METEO_AGROMET_LOT_ALLOWLIST,
  CHAMAN_METEO_CALCULATION_VERSION,
  CHAMAN_METEO_CDS_CONFIGURED,
  CHAMAN_METEO_ENABLED,
  CHAMAN_METEO_HISTORICAL_START,
  CHAMAN_METEO_IMPORT_ENABLED,
  CHAMAN_METEO_RUNTIME_CONFIGURATION_ERROR,
  CHAMAN_METEO_RUNTIME_CONFIGURATION_VALID,
  CHAMAN_METEO_SOURCE_VERSION,
} from '../../env';
import { ChamanMeteoRepository } from './repository';

export function chamanMeteoAdminState(
  enabled: boolean,
  storage: IChamanMeteoStorageStatus,
  configured = !!storage.latestJob,
  configurationValid = true,
): IChamanMeteoAdminStatus['state'] {
  if (!enabled) return 'DISABLED';
  if (!configurationValid) return 'ERROR';
  const importing = storage.jobsByStatus.DOWNLOADING > 0;
  const available =
    storage.hourlyDerivedRecords > 0 || storage.dailyRecords > 0;
  const unresolved =
    storage.jobsByStatus.PARTIAL > 0 || storage.jobsByStatus.FAILED > 0;
  if (unresolved) return 'ERROR';
  if (importing) return 'IMPORTING';
  if (available) return 'AVAILABLE';
  return configured ? 'READY' : 'DISABLED';
}

@Injectable()
export class ChamanMeteoService {
  constructor(private readonly repository: ChamanMeteoRepository) {}

  async status(): Promise<IChamanMeteoAdminStatus> {
    const receivedStorage = CHAMAN_METEO_RUNTIME_CONFIGURATION_VALID
      ? await this.repository.status(
          CHAMAN_METEO_CALCULATION_VERSION,
          CHAMAN_METEO_SOURCE_VERSION,
        )
      : this.emptyStorageStatus();
    const storageCompatible =
      !CHAMAN_METEO_RUNTIME_CONFIGURATION_VALID ||
      this.storageStatusMatchesActiveVersions(receivedStorage);
    const storage = storageCompatible
      ? receivedStorage
      : this.emptyStorageStatus();
    const configurationValid =
      CHAMAN_METEO_RUNTIME_CONFIGURATION_VALID && storageCompatible;
    const storageContractError = storageCompatible
      ? undefined
      : 'sdc-datos no confirmo el contrato versionado de Chaman-Meteo v2; desplegar almacenamiento antes que la API';
    const configured = CHAMAN_METEO_CDS_CONFIGURED;
    return {
      ...storage,
      service: 'Chaman-Meteo',
      enabled: CHAMAN_METEO_ENABLED,
      importEnabled: CHAMAN_METEO_IMPORT_ENABLED,
      credentialConfigured: configured,
      provider: 'Copernicus Climate Data Store',
      dataset: 'ERA5-Land time-series',
      historicalStart: CHAMAN_METEO_HISTORICAL_START,
      calculationVersion: CHAMAN_METEO_CALCULATION_VERSION,
      sourceVersion: CHAMAN_METEO_SOURCE_VERSION,
      operationalSourceUnchanged: !CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
      agrometBridgeEnabled: CHAMAN_METEO_AGROMET_BRIDGE_ENABLED,
      agrometAutoProvisionEnabled:
        CHAMAN_METEO_AGROMET_AUTO_PROVISION_ENABLED,
      agrometAutoProvisionFrom: CHAMAN_METEO_AGROMET_AUTO_PROVISION_FROM,
      agrometPilotLots: CHAMAN_METEO_AGROMET_LOT_ALLOWLIST.length,
      agrometPilotSowings: 0,
      configurationValid,
      lastError:
        CHAMAN_METEO_RUNTIME_CONFIGURATION_ERROR ||
        storageContractError ||
        storage.latestProblemJob?.lastError ||
        storage.latestJob?.lastError,
      state: chamanMeteoAdminState(
        CHAMAN_METEO_ENABLED,
        storage,
        configured,
        configurationValid,
      ),
      checkedAt: new Date().toISOString(),
    };
  }

  gridPoints(limit?: string, offset?: string) {
    this.assertRuntimeConfiguration();
    return this.repository.gridPoints(
      this.number(limit, 100, 1, 500),
      this.number(offset, 0, 0, 1_000_000),
    );
  }

  jobs(limit?: string, offset?: string) {
    this.assertRuntimeConfiguration();
    return this.repository.jobs(
      this.number(limit, 25, 1, 200),
      this.number(offset, 0, 0, 1_000_000),
      CHAMAN_METEO_CALCULATION_VERSION,
      CHAMAN_METEO_SOURCE_VERSION,
    );
  }

  hourly(
    gridPointKey?: string,
    limit?: string,
    offset?: string,
    from?: string,
    toExclusive?: string,
  ) {
    this.assertRuntimeConfiguration();
    this.assertHistoricalLimit(from, 'hourly');
    this.assertHistoricalLimit(toExclusive, 'hourly');
    return this.repository.hourly(
      gridPointKey,
      this.number(limit, 48, 1, 500),
      this.number(offset, 0, 0, 1_000_000),
      CHAMAN_METEO_CALCULATION_VERSION,
      from,
      toExclusive,
    );
  }

  daily(
    gridPointKey?: string,
    limit?: string,
    offset?: string,
    from?: string,
    toExclusive?: string,
  ) {
    this.assertRuntimeConfiguration();
    this.assertHistoricalLimit(from, 'daily');
    this.assertHistoricalLimit(toExclusive, 'daily');
    return this.repository.daily(
      gridPointKey,
      this.number(limit, 30, 1, 500),
      this.number(offset, 0, 0, 1_000_000),
      CHAMAN_METEO_CALCULATION_VERSION,
      from,
      toExclusive,
    );
  }

  private assertHistoricalLimit(
    from: string | undefined,
    grain: 'hourly' | 'daily',
  ): void {
    const text = String(from || '').trim();
    if (!text) return;

    let parsed: Date;
    if (grain === 'daily') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return;
      parsed = new Date(`${text}T00:00:00.000Z`);
      if (
        !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== text
      ) {
        return;
      }
    } else {
      parsed = new Date(text);
      if (!Number.isFinite(parsed.getTime())) return;
    }

    const historicalStart = new Date(
      `${CHAMAN_METEO_HISTORICAL_START}T00:00:00.000Z`,
    );
    if (parsed < historicalStart) {
      throw new BadRequestException({
        error: 'historical_data_before_limit',
        historical_available_from: CHAMAN_METEO_HISTORICAL_START,
      });
    }
  }

  private assertRuntimeConfiguration(): void {
    if (CHAMAN_METEO_RUNTIME_CONFIGURATION_VALID) return;
    throw new ServiceUnavailableException({
      error: 'chaman_meteo_configuration_error',
      message: CHAMAN_METEO_RUNTIME_CONFIGURATION_ERROR,
    });
  }

  private emptyStorageStatus(): IChamanMeteoStorageStatus {
    return {
      calculationVersion: CHAMAN_METEO_CALCULATION_VERSION,
      sourceVersion: CHAMAN_METEO_SOURCE_VERSION,
      gridPoints: 0,
      activeBindings: 0,
      hourlyRawRecords: 0,
      hourlyDerivedRecords: 0,
      dailyRecords: 0,
      jobsByStatus: {
        PENDING: 0,
        DOWNLOADING: 0,
        PARTIAL: 0,
        AVAILABLE: 0,
        FAILED: 0,
      },
    };
  }

  private storageStatusMatchesActiveVersions(
    storage: IChamanMeteoStorageStatus,
  ): boolean {
    return (
      storage?.calculationVersion === CHAMAN_METEO_CALCULATION_VERSION &&
      storage?.sourceVersion === CHAMAN_METEO_SOURCE_VERSION
    );
  }

  private number(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(value);
    return Number.isInteger(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : fallback;
  }
}
