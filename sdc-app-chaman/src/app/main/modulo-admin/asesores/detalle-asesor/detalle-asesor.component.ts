import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IDetalleAuditoriaAsesor, ILoteAuditoriaAsesor } from 'modelos/src';
import { UsuarioService } from '../../../../auxiliares/http/usuario.service';
import { LoteService } from '../../../../auxiliares/http/lote.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ConfirmationService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-detalle-asesor',
  imports: [SharedModule],
  templateUrl: './detalle-asesor.component.html',
  styleUrl: './detalle-asesor.component.scss',
})
export class DetalleAsesorComponent implements OnInit {
  public loading = false;
  public detalle?: IDetalleAuditoriaAsesor;
  private idAsesor = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private usuarioService: UsuarioService,
    private loteService: LoteService,
    private helper: HelperService,
    private confirmationService: ConfirmationService,
    private translate: TranslateService,
  ) {}

  public async ngOnInit(): Promise<void> {
    this.idAsesor = this.route.snapshot.paramMap.get('id') || '';
    if (!this.idAsesor) {
      this.volver();
      return;
    }
    await this.cargar();
  }

  public async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.detalle = await this.usuarioService.detalleAuditoriaAsesor(
        this.idAsesor,
      );
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  public editar(): void {
    if (this.detalle?.asesor.archivado) return;
    void this.router.navigate(['/asesores/editar', this.idAsesor]);
  }

  public archivar(): void {
    const asesor = this.detalle?.asesor;
    if (!asesor || asesor.archivado) return;
    const recursos = `${asesor.metricas.productores} productores, ${asesor.metricas.establecimientos} establecimientos y ${asesor.metricas.lotes} lotes`;
    this.confirmationService.confirm({
      header: 'Archivar asesor',
      message: `Se retirará a ${asesor.nombre} de la operación y se archivarán sus recursos directos (${recursos}). No se borrará información y quedará disponible para auditoría.`,
      icon: 'pi pi-archive',
      closable: true,
      closeOnEscape: true,
      rejectButtonProps: {
        label: this.translate.instant('Cancelar'),
        severity: 'secondary',
        outlined: true,
      },
      acceptButtonProps: { label: 'Archivar', severity: 'danger' },
      accept: async () => {
        this.loading = true;
        try {
          await this.usuarioService.eliminar(this.idAsesor);
          this.helper.notifSuccess(
            'Asesor archivado. La información histórica fue preservada.',
          );
          this.volver();
        } catch (error) {
          this.helper.notifError(error);
        } finally {
          this.loading = false;
        }
      },
    });
  }

  public archivarLote(lote: ILoteAuditoriaAsesor): void {
    if (!lote?.id || this.detalle?.asesor.archivado) return;
    this.confirmationService.confirm({
      header: 'Archivar lote',
      message: `Se archivará ${lote.nombre} y dejará de aparecer en la operación activa. Las siembras, imágenes satelitales e históricos se conservarán para auditoría.`,
      icon: 'pi pi-archive',
      closable: true,
      closeOnEscape: true,
      rejectButtonProps: {
        label: this.translate.instant('Cancelar'),
        severity: 'secondary',
        outlined: true,
      },
      acceptButtonProps: { label: 'Archivar', severity: 'danger' },
      accept: async () => {
        this.loading = true;
        try {
          await this.loteService.eliminar(lote.id);
          this.helper.notifSuccess(
            'Lote archivado. Sus datos históricos fueron preservados.',
          );
          await this.cargar();
        } catch (error) {
          this.helper.notifError(error);
        } finally {
          this.loading = false;
        }
      },
    });
  }

  public volver(): void {
    void this.router.navigateByUrl('/asesores');
  }

  public iniciales(): string {
    return (
      this.detalle?.asesor.nombre
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((parte) => parte[0]?.toUpperCase())
        .join('') || 'AS'
    );
  }

  public coordenadas(): string {
    const coordenadas = this.detalle?.asesor.geojson?.coordinates;
    if (!coordenadas || coordenadas.length !== 2) return 'Sin coordenadas';
    return `${Number(coordenadas[1]).toFixed(5)}, ${Number(coordenadas[0]).toFixed(5)}`;
  }
}
