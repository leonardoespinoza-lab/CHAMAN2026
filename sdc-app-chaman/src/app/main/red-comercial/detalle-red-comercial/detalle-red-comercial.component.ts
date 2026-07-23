import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IDistribuidorRedComercial,
  IEstablecimientoRedComercial,
  IProductorRedComercial,
  IResumenRedComercial,
} from 'modelos/src';
import { DistribuidorService } from '../../../auxiliares/http/distribuidor.service';
import { ProductorsService } from '../../../auxiliares/http/productor.service';
import { UsuarioService } from '../../../auxiliares/http/usuario.service';
import { HelperService } from '../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../auxiliares/shared.module';

@Component({
  selector: 'app-detalle-red-comercial',
  imports: [SharedModule],
  templateUrl: './detalle-red-comercial.component.html',
  styleUrl: './detalle-red-comercial.component.scss',
})
export class DetalleRedComercialComponent implements OnInit {
  public loading = false;
  public red?: IResumenRedComercial;
  public tipo: 'distribuidor' | 'productor' = 'distribuidor';
  private id = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private usuarios: UsuarioService,
    private distribuidoresService: DistribuidorService,
    private productoresService: ProductorsService,
    private params: ParamsService,
    private helper: HelperService,
  ) {}

  public async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    this.tipo = this.route.snapshot.data['tipo'] === 'productor' ? 'productor' : 'distribuidor';
    if (!this.id) {
      this.volver();
      return;
    }
    await this.cargar();
  }

  public async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.red = await this.usuarios.resumenRedComercial();
      if (!this.entidad) {
        this.helper.notifWarn('La entidad ya no se encuentra dentro de su alcance.');
        this.volver();
      }
    } catch (error) {
      this.helper.notifError(error);
    } finally {
      this.loading = false;
    }
  }

  public get distribuidor(): IDistribuidorRedComercial | undefined {
    return this.tipo === 'distribuidor'
      ? this.red?.distribuidores.find((item) => item.id === this.id)
      : undefined;
  }

  public get productor(): IProductorRedComercial | undefined {
    return this.tipo === 'productor'
      ? this.red?.productores.find((item) => item.id === this.id)
      : undefined;
  }

  public get entidad(): IDistribuidorRedComercial | IProductorRedComercial | undefined {
    return this.distribuidor || this.productor;
  }

  public get productoresAsociados(): IProductorRedComercial[] {
    if (this.distribuidor) {
      return this.red?.productores.filter((item) => item.idDistribuidor === this.distribuidor?.id) || [];
    }
    return this.productor ? [this.productor] : [];
  }

  public get establecimientosAsociados(): IEstablecimientoRedComercial[] {
    if (this.distribuidor) {
      const idsProductores = new Set(this.productoresAsociados.map((item) => item.id));
      return (
        this.red?.establecimientos.filter(
          (item) => item.idDistribuidor === this.distribuidor?.id || (!!item.idProductor && idsProductores.has(item.idProductor)),
        ) || []
      );
    }
    return this.red?.establecimientos.filter((item) => item.idProductor === this.productor?.id) || [];
  }

  public coordenadas(): string {
    const coordenadas = this.entidad?.geojson?.coordinates;
    if (!coordenadas) return 'Sin coordenadas';
    return `${Number(coordenadas[1]).toFixed(5)}, ${Number(coordenadas[0]).toFixed(5)}`;
  }

  public abrirMapa(): void {
    const coordenadas = this.entidad?.geojson?.coordinates;
    if (!coordenadas) return;
    window.open(`https://www.google.com/maps?q=${coordenadas[1]},${coordenadas[0]}`, '_blank', 'noopener,noreferrer');
  }

  public async editar(): Promise<void> {
    if (this.tipo === 'distribuidor') {
      const distribuidor = await this.distribuidoresService.listarPorId(this.id);
      this.params.set('editDistribuidor', distribuidor);
      await this.router.navigate(['/distribuidores/editar', this.id]);
      return;
    }
    const productor = await this.productoresService.listarPorId(this.id);
    this.params.set('editProductor', productor);
    await this.router.navigate(['/productores/editar', this.id]);
  }

  public verProductor(id: string): void {
    void this.router.navigate(['/productores/ver', id]);
  }

  public volver(): void {
    void this.router.navigateByUrl(this.tipo === 'distribuidor' ? '/distribuidores' : '/productores');
  }
}
