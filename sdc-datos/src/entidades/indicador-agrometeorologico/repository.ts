import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ICreateIndicadorAgrometeorologico,
  IListado,
  IQueryParam,
} from 'modelos/src';
import { Model } from 'mongoose';
import { createHash } from 'node:crypto';
import { dbQuery } from 'src/auxiliares/helper.service';
import {
  INDICADOR_AGROMETEOROLOGICO_GENERACION_MODEL,
  INDICADOR_AGROMETEOROLOGICO_GENERADO_MODEL,
  IndicadorAgrometeorologico,
  IndicadorAgrometeorologicoDocument,
} from './modelos/schema';

@Injectable()
export class IndicadoresAgrometeorologicosRepository {
  private static readonly GENERATION_RETENTION_MS = 24 * 60 * 60 * 1000;
  private static readonly DELETED_SOWING_VERSION = '__deleted__';
  private readonly logger = new Logger(
    IndicadoresAgrometeorologicosRepository.name,
  );

  constructor(
    @InjectModel(IndicadorAgrometeorologico.name)
    private readonly model: Model<IndicadorAgrometeorologicoDocument>,
    @InjectModel(INDICADOR_AGROMETEOROLOGICO_GENERADO_MODEL)
    private readonly generatedModel: Model<any>,
    @InjectModel(INDICADOR_AGROMETEOROLOGICO_GENERACION_MODEL)
    private readonly generationModel: Model<any>,
  ) {}

  async getFilter(
    params: IQueryParam,
  ): Promise<IListado<IndicadorAgrometeorologico>> {
    return await dbQuery(this.model, params);
  }

  async upsertMany(data: ICreateIndicadorAgrometeorologico[]) {
    if (!data.length)
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    const sowingIds = [
      ...new Set(data.map((item) => String(item.idSiembra))),
    ];
    const tombstonedBeforeWrite =
      await this.getTombstonedSowingIds(sowingIds);
    const accepted = data.filter(
      (item) => !tombstonedBeforeWrite.has(String(item.idSiembra)),
    );
    if (!accepted.length) {
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    }
    const result = await this.model.bulkWrite(
      accepted.map((item) => ({
        updateOne: {
          filter: {
            idSiembra: item.idSiembra,
            fecha: item.fecha,
            versionCalculo: item.versionCalculo,
          },
          update: { $set: item },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    const tombstonedAfterWrite =
      await this.getTombstonedSowingIds(sowingIds);
    if (tombstonedAfterWrite.size) {
      await this.model.deleteMany({
        idSiembra: { $in: [...tombstonedAfterWrite] },
      });
    }
    return result;
  }

  async deleteBySowing(idSiembra: string) {
    const deletedAt = new Date();
    await this.generationModel.updateOne(
      {
        idSiembra,
        versionCalculo:
          IndicadoresAgrometeorologicosRepository.DELETED_SOWING_VERSION,
      },
      {
        $set: {
          generacionActiva: 'deleted',
          cantidadIndicadores: 0,
          activadaEn: deletedAt,
          eliminadaEn: deletedAt,
        },
        $unset: {
          generacionEnProceso: '',
          leaseProcesoHasta: '',
        },
      },
      { upsert: true, runValidators: true },
    );
    const [legacy, generated, generations] = await Promise.all([
      this.model.deleteMany({ idSiembra }),
      this.generatedModel.deleteMany({ idSiembra }),
      this.generationModel.deleteMany({
        idSiembra,
        versionCalculo: {
          $ne: IndicadoresAgrometeorologicosRepository.DELETED_SOWING_VERSION,
        },
      }),
    ]);
    return {
      legacyDeleted: Number(legacy?.deletedCount || 0),
      generatedDeleted: Number(generated?.deletedCount || 0),
      generationManifestsDeleted: Number(generations?.deletedCount || 0),
    };
  }

  async acquireGenerationLease(
    idSiembra: string,
    versionCalculo: string,
    generacionCalculo: string,
  ): Promise<{
    previousGeneration?: string;
    previousIntervalEnd?: string;
    leaseUntil: string;
  }> {
    if (!idSiembra || !versionCalculo || !generacionCalculo) {
      throw new BadRequestException(
        'El lease agrometeorologico requiere siembra, version y generacion.',
      );
    }
    if (await this.isSowingTombstoned(idSiembra)) {
      throw new BadRequestException(
        'La siembra fue eliminada y no admite nuevos reprocesos agrometeorologicos.',
      );
    }
    const startedAt = new Date();
    const leaseUntil = new Date(startedAt.getTime() + 30 * 60 * 1000);
    let lease: any;
    try {
      lease = await this.generationModel.findOneAndUpdate(
        {
          idSiembra,
          versionCalculo,
          $or: [
            { generacionEnProceso: { $exists: false } },
            { leaseProcesoHasta: { $lt: startedAt } },
            { generacionEnProceso: generacionCalculo },
          ],
        },
        {
          $setOnInsert: {
            idSiembra,
            versionCalculo,
            generacionActiva: 'legacy',
            cantidadIndicadores: 0,
            activadaEn: startedAt,
          },
          $set: {
            generacionEnProceso: generacionCalculo,
            leaseProcesoHasta: leaseUntil,
          },
        },
        { upsert: true, new: true, runValidators: true },
      );
    } catch (error) {
      if (Number((error as any)?.code) === 11000) {
        throw new ConflictException(
          `Ya existe un reproceso agrometeorologico activo para ${idSiembra}.`,
        );
      }
      throw error;
    }
    if (String(lease?.generacionEnProceso || '') !== generacionCalculo) {
      throw new ConflictException(
        `No se pudo adquirir el lease de reproceso para ${idSiembra}.`,
      );
    }
    return {
      ...(lease?.generacionActiva &&
      lease.generacionActiva !== 'legacy'
        ? { previousGeneration: String(lease.generacionActiva) }
        : {}),
      ...(lease?.intervaloHasta
        ? { previousIntervalEnd: String(lease.intervaloHasta).slice(0, 10) }
        : {}),
      leaseUntil: leaseUntil.toISOString(),
    };
  }

  async replaceGeneration(
    idSiembra: string,
    versionCalculo: string,
    generacionCalculo: string,
    data: ICreateIndicadorAgrometeorologico[],
    intervaloEsperado: {
      desde: string;
      hasta: string;
      cantidad: number;
      checksumFechas: string;
    },
  ) {
    const rows = data || [];
    if (
      !idSiembra ||
      !versionCalculo ||
      !generacionCalculo ||
      !rows.length ||
      rows.some(
        (item) =>
          String(item.idSiembra) !== String(idSiembra) ||
          item.versionCalculo !== versionCalculo ||
          item.generacionCalculo !== generacionCalculo,
      )
    ) {
      throw new BadRequestException(
        'La generacion agrometeorologica es invalida o esta incompleta.',
      );
    }
    const uniqueDates = new Set(rows.map((item) => item.fecha));
    if (uniqueDates.size !== rows.length) {
      throw new BadRequestException(
        'La generacion agrometeorologica contiene fechas duplicadas.',
      );
    }
    const expectedDates = this.calendarDateSequence(
      intervaloEsperado?.desde,
      intervaloEsperado?.hasta,
    );
    const actualDates = [...uniqueDates].sort();
    const expectedChecksum = this.generationDatesChecksum(
      idSiembra,
      versionCalculo,
      expectedDates,
    );
    if (
      intervaloEsperado?.cantidad !== expectedDates.length ||
      intervaloEsperado?.checksumFechas !== expectedChecksum ||
      actualDates.length !== expectedDates.length ||
      actualDates.some((date, index) => date !== expectedDates[index])
    ) {
      throw new BadRequestException(
        'La generacion agrometeorologica no cubre de forma continua el intervalo esperado.',
      );
    }
    if (
      rows.some(
        (item) =>
          ![
            item.metricas?.temperatureMinC,
            item.metricas?.temperatureMeanC,
            item.metricas?.temperatureMaxC,
          ].every(
            (value) => typeof value === 'number' && Number.isFinite(value),
          ),
      )
    ) {
      throw new BadRequestException(
        'La generacion contiene dias sin cobertura termica diaria completa y no puede reemplazar la serie activa.',
      );
    }

    const { previousGeneration, previousIntervalEnd } =
      await this.acquireGenerationLease(
        idSiembra,
        versionCalculo,
        generacionCalculo,
      );
    if (
      previousGeneration &&
      previousIntervalEnd &&
      String(intervaloEsperado.hasta).slice(0, 10) < previousIntervalEnd
    ) {
      await this.releaseGenerationLease(
        idSiembra,
        versionCalculo,
        generacionCalculo,
      );
      throw new BadRequestException(
        `La nueva generacion finaliza ${intervaloEsperado.hasta} y no puede degradar la serie activa que llega hasta ${previousIntervalEnd}.`,
      );
    }

    let writeResult: any;
    try {
      writeResult = await this.generatedModel.bulkWrite(
        rows.map((item) => ({
          updateOne: {
            filter: {
              idSiembra: item.idSiembra,
              fecha: item.fecha,
              versionCalculo: item.versionCalculo,
              generacionCalculo: item.generacionCalculo,
            },
            update: { $set: item },
            upsert: true,
          },
        })),
        { ordered: false },
      );

      const persisted = await this.generatedModel.countDocuments({
        idSiembra,
        versionCalculo,
        generacionCalculo,
      });
      if (persisted !== rows.length) {
        throw new Error(
          `La generacion ${generacionCalculo} quedo incompleta: ${persisted}/${rows.length}.`,
        );
      }
    } catch (error) {
      await this.generatedModel
        .deleteMany({ idSiembra, versionCalculo, generacionCalculo })
        .catch(() => undefined);
      await this.releaseGenerationLease(
        idSiembra,
        versionCalculo,
        generacionCalculo,
      );
      throw error;
    }

    const activatedAt = new Date();
    const activated = await this.generationModel.findOneAndUpdate(
      {
        idSiembra,
        versionCalculo,
        generacionEnProceso: generacionCalculo,
        leaseProcesoHasta: { $gte: new Date() },
      },
      {
        $set: {
          generacionActiva: generacionCalculo,
          cantidadIndicadores: rows.length,
          activadaEn: activatedAt,
          intervaloDesde: intervaloEsperado.desde,
          intervaloHasta: intervaloEsperado.hasta,
          checksumFechas: intervaloEsperado.checksumFechas,
        },
      },
      { new: true, runValidators: true },
    );
    if (!activated) {
      await this.generatedModel
        .deleteMany({ idSiembra, versionCalculo, generacionCalculo })
        .catch(() => undefined);
      await this.releaseGenerationLease(
        idSiembra,
        versionCalculo,
        generacionCalculo,
      );
      throw new Error(
        `El lease de la generacion ${generacionCalculo} vencio antes de activarla.`,
      );
    }

    if (await this.isSowingTombstoned(idSiembra)) {
      await Promise.all([
        this.generatedModel.deleteMany({
          idSiembra,
          versionCalculo,
          generacionCalculo,
        }),
        this.generationModel.deleteMany({ idSiembra, versionCalculo }),
      ]);
      await this.releaseGenerationLease(
        idSiembra,
        versionCalculo,
        generacionCalculo,
      );
      throw new BadRequestException(
        'La siembra fue eliminada durante el reproceso agrometeorologico.',
      );
    }

    let cleanupPending = false;
    if (previousGeneration) {
      try {
        await this.generatedModel.updateMany(
          {
            idSiembra,
            versionCalculo,
            generacionCalculo: previousGeneration,
            expiraEn: { $exists: false },
          },
          {
            $set: {
              expiraEn: new Date(
                Date.now() +
                  IndicadoresAgrometeorologicosRepository.GENERATION_RETENTION_MS,
              ),
            },
          },
        );
      } catch {
        // Solo la generacion que era activa al adquirir el lease recibe TTL.
        // Una corrida concurrente en staging nunca queda alcanzada.
        cleanupPending = true;
      }
    }
    await this.releaseGenerationLease(
      idSiembra,
      versionCalculo,
      generacionCalculo,
    );

    return {
      generationId: generacionCalculo,
      activatedAt: activatedAt.toISOString(),
      indicators: rows.length,
      cleanupPending,
      matchedCount: Number(writeResult?.matchedCount || 0),
      modifiedCount: Number(writeResult?.modifiedCount || 0),
      upsertedCount: Number(writeResult?.upsertedCount || 0),
    };
  }

  private async isSowingTombstoned(idSiembra: string): Promise<boolean> {
    if (typeof (this.generationModel as any)?.exists !== 'function') {
      return false;
    }
    return Boolean(
      await this.generationModel.exists({
        idSiembra,
        versionCalculo:
          IndicadoresAgrometeorologicosRepository.DELETED_SOWING_VERSION,
        eliminadaEn: { $exists: true },
      }),
    );
  }

  private async getTombstonedSowingIds(
    idSiembras: string[],
  ): Promise<Set<string>> {
    if (
      !idSiembras.length ||
      typeof (this.generationModel as any)?.find !== 'function'
    ) {
      return new Set();
    }
    const rows = await this.generationModel
      .find({
        idSiembra: { $in: idSiembras },
        versionCalculo:
          IndicadoresAgrometeorologicosRepository.DELETED_SOWING_VERSION,
        eliminadaEn: { $exists: true },
      })
      .select({ idSiembra: 1 })
      .lean();
    return new Set((rows || []).map((item) => String(item.idSiembra)));
  }

  async releaseGenerationLease(
    idSiembra: string,
    versionCalculo: string,
    generacionCalculo: string,
  ): Promise<void> {
    await this.generationModel
      .updateOne(
        {
          idSiembra,
          versionCalculo,
          generacionEnProceso: generacionCalculo,
        },
        {
          $unset: {
            generacionEnProceso: '',
            leaseProcesoHasta: '',
          },
        },
      )
      .catch((error) => {
        this.logger.error(
          `No se pudo liberar el lease ${generacionCalculo} de ${idSiembra}: ${error?.message || error}`,
        );
        return undefined;
      });
  }

  private calendarDateSequence(from: string, to: string): string[] {
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDate.test(String(from || '')) || !isoDate.test(String(to || ''))) {
      throw new BadRequestException(
        'El intervalo esperado debe usar fechas ISO validas.',
      );
    }
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    const days = (end.getTime() - start.getTime()) / 86400000;
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      !Number.isInteger(days) ||
      days < 0 ||
      days > 5000
    ) {
      throw new BadRequestException(
        'El intervalo esperado es invalido o excede el limite operativo.',
      );
    }
    return Array.from({ length: days + 1 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
  }

  private generationDatesChecksum(
    idSiembra: string,
    versionCalculo: string,
    dates: string[],
  ): string {
    return createHash('sha256')
      .update(`${idSiembra}|${versionCalculo}|${dates.join(',')}`)
      .digest('hex');
  }

  async getActiveGeneration(idSiembra: string, versionCalculo: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generation = (await this.generationModel
        .findOne({ idSiembra, versionCalculo })
        .lean()) as
        | {
            generacionActiva?: string;
            cantidadIndicadores?: number;
            activadaEn?: string;
          }
        | null;
      if (
        !generation?.generacionActiva ||
        generation.generacionActiva === 'legacy'
      ) {
        return {
          generationId: undefined,
          activatedAt: undefined,
          data: [],
        };
      }
      const data = await this.generatedModel
        .find({
          idSiembra,
          versionCalculo,
          generacionCalculo: generation.generacionActiva,
        })
        .sort({ fecha: 1 })
        .lean();
      if (
        !Number.isFinite(Number(generation.cantidadIndicadores)) ||
        data.length === Number(generation.cantidadIndicadores)
      ) {
        return {
          generationId: String(generation.generacionActiva),
          activatedAt: generation.activadaEn,
          data,
        };
      }

      if (attempt === 0) {
        const current = (await this.generationModel
          .findOne({ idSiembra, versionCalculo })
          .lean()) as { generacionActiva?: string } | null;
        if (
          current?.generacionActiva &&
          current.generacionActiva !== generation.generacionActiva
        ) {
          continue;
        }
      }
      throw new Error(
        `La generacion activa ${generation.generacionActiva} no coincide con su manifiesto.`,
      );
    }

    throw new Error(
      `No se pudo obtener un snapshot estable para ${idSiembra}.`,
    );
  }
}
