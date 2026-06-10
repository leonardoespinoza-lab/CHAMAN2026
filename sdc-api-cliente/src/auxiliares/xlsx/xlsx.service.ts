import { Injectable } from '@nestjs/common';
import {
  IPrediccion,
  IVariablesFusariumDeLaEspiga,
  IVariablesManchaAmarilla,
  IVariablesManchaDeLaHoja,
  IVariablesRoyaDeLaHoja,
} from 'modelos/src';
import { utils, WorkBook, WorkSheet, write } from 'sheetjs-style';

export const ETAPAS_TRIGO: string[] = [
  'Siembra',
  'Emergencia',
  'Espiguilla Terminal',
  'Hoja Bandera',
  'Espigazón',
  'Antesis',
  'Llenado de Granos',
  'Maduréz Fisiológica',
];

@Injectable()
export class XlsxService {
  public async predicciones(data: IPrediccion[]) {
    const rows: Record<string, string>[] = [];
    data.forEach((d) => {
      const row: Record<string, string> = {};
      row['Fecha'] = this.getFecha(d.fecha);
      row['Fecha de Siembra'] = this.getFecha(d.siembra.fechaSiembra);
      row['Etapa Actual'] = `${d.etapa} - ${ETAPAS_TRIGO[d.etapa]}`;
      row['Cultivo'] = d.siembra?.semilla?.cultivo;
      row['Semillero'] = d.siembra?.semilla?.semillero;
      row['Variedad'] = d.siembra?.semilla?.variedad;
      row['Ciclo'] = d.siembra?.semilla?.ciclo;

      // Enfermedades
      const roya = d.enfermedades.find(
        (e) => e.enfermedad === 'Roya de la Hoja',
      );
      const variablesRoya = roya?.variables as IVariablesRoyaDeLaHoja;
      const fusarium = d.enfermedades.find(
        (e) => e.enfermedad === 'Fusarium de la Espiga',
      );
      const variablesFusarium =
        fusarium?.variables as IVariablesFusariumDeLaEspiga;
      const manchaAmarilla = d.enfermedades.find(
        (e) => e.enfermedad === 'Mancha Amarilla',
      );
      const variablesManchaAmarilla =
        manchaAmarilla?.variables as IVariablesManchaAmarilla;
      const manchaDeLaHoja = d.enfermedades.find(
        (e) => e.enfermedad === 'Mancha de la Hoja',
      );
      const variablesManchaDeLaHoja =
        manchaDeLaHoja?.variables as IVariablesManchaDeLaHoja;
      row['Roya de la Hoja'] = roya
        ? `${roya?.resultado} (GD: ${variablesRoya?.GD} DHR: ${variablesRoya?.DHR})`
        : '';
      row['Mancha Amarilla'] = manchaAmarilla
        ? `${manchaAmarilla?.resultado} (DPr: ${variablesManchaAmarilla?.DPr} DPrHRT: ${variablesManchaAmarilla?.DPrHRT})`
        : '';
      row['Mancha de la Hoja'] = manchaDeLaHoja
        ? `${manchaDeLaHoja?.resultado} (DPr: ${variablesManchaDeLaHoja?.DPr} DHR: ${variablesManchaDeLaHoja?.DHR})`
        : '';
      row['Fusarium de la Espiga'] = fusarium
        ? `${fusarium?.resultado} (GDN: ${variablesFusarium?.GDN} PMoj: ${variablesFusarium?.PMoj} GDAcum: ${variablesFusarium?.GDAcum})`
        : '';
      // Clima
      row['Distancia Estacion'] = `${Math.trunc(
        d.estacion.distanciaMetros / 1000,
      )} km.`;
      row['Precipitaciones'] = `${d.estacion.precipitaciones} mm`;
      row['Humedad Relativa'] = `${d.estacion.humedadRelativa} %`;
      row['Temp. Min'] = `${d.estacion.temperaturaMinima} ºC`;
      row['Temp. Max'] = `${d.estacion.temperaturaMaxima} ºC`;
      row['Temp. Promedio'] = `${d.estacion.temperaturaPromedio} ºC`;

      rows.push(row);
    });
    const sheet = this.prediccionesSheet(rows);
    return await this.toXls(sheet);
  }

  private prediccionesSheet(rows: Record<string, string>[]) {
    const sheet: WorkSheet = utils.json_to_sheet(rows);
    const color1 = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1'];
    const color2 = ['H1', 'I1', 'J1', 'K1'];
    const color3 = ['L1', 'M1', 'N1', 'O1', 'P1', 'Q1'];

    color1.forEach((c) => {
      sheet[c].s = {
        fill: {
          patternType: 'solid',
          fgColor: { rgb: 'FFFFAA00' },
          bgColor: { rgb: 'FFFFAA00' },
        },
        font: {
          bold: true,
        },
        alignment: {
          horizontal: 'center',
        },
      };
    });
    color2.forEach((c) => {
      sheet[c].s = {
        fill: {
          patternType: 'solid',
          fgColor: { rgb: 'FF00AAFF' },
          bgColor: { rgb: 'FF00AAFF' },
        },
        font: {
          bold: true,
        },
        alignment: {
          horizontal: 'center',
        },
      };
    });
    color3.forEach((c) => {
      sheet[c].s = {
        fill: {
          patternType: 'solid',
          fgColor: { rgb: 'FF00FFAA' },
          bgColor: { rgb: 'FF00FFAA' },
        },
        font: {
          bold: true,
        },
        alignment: {
          horizontal: 'center',
        },
      };
    });
    return sheet;
  }

  // Private

  private async toXls(sheet: WorkSheet): Promise<Buffer> {
    try {
      const workbook: WorkBook = utils.book_new();
      utils.book_append_sheet(workbook, sheet);
      return await write(workbook, { type: 'buffer', bookType: 'xlsx' });
    } catch (error) {
      console.error(`Error al generar el archivo: ${error}`);
      throw error;
    }
  }

  private getFecha(time: string) {
    if (time) {
      const date = new Date(time);
      date.setHours(date.getHours() - 3);
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const fecha = day + '/' + month + '/' + year;
      return fecha;
    }
    return '';
  }

  private getFechaYHora(time: string) {
    if (time) {
      const date = new Date(time);
      date.setHours(date.getHours() - 3);
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const hour = date.getHours();
      const minutes = `0${date.getMinutes()}`.slice(-2);
      const seconds = `0${date.getSeconds()}`.slice(-2);
      const fecha =
        day +
        '/' +
        month +
        '/' +
        year +
        ', ' +
        hour +
        ':' +
        minutes +
        ':' +
        seconds;
      return fecha;
    }
    return '';
  }

  private msToTime(duration = 0) {
    const portions: string[] = [];

    const msInDay = 1000 * 60 * 60 * 24;
    const days = Math.trunc(duration / msInDay);
    if (days > 0) {
      portions.push(`${days}d`);
      duration = duration - days * msInDay;
    }

    const msInHour = 1000 * 60 * 60;
    const hours = Math.trunc(duration / msInHour);
    if (hours > 0) {
      portions.push(hours + 'h');
      duration = duration - hours * msInHour;
    }

    if (portions.length < 2) {
      const msInMinute = 1000 * 60;
      const minutes = Math.trunc(duration / msInMinute);
      if (minutes > 0) {
        portions.push(minutes + 'm');
        duration = duration - minutes * msInMinute;
      }
    }

    if (portions.length < 2) {
      const seconds = Math.trunc(duration / 1000);
      if (seconds > 0) {
        portions.push(seconds + 's');
      }
    }

    return portions.join(' ');
  }
}
