import { Component, OnInit, OnDestroy  } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Cultivo, ICreateSemilla, ISemilla, IListado, IQueryParam } from 'modelos/src';
import { SemillaService } from '../../../../auxiliares/http/semilla.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-crear-editar-semillas',
  imports: [SharedModule],
  templateUrl: './crear-editar-semillas.component.html',
  styleUrl: './crear-editar-semillas.component.scss',
})
export class CrearEditarSemillasComponent implements OnInit, OnDestroy {
  public loading = false;
  public semilla?: ISemilla;
  public titulo?: () => string;
  public form?: FormGroup;

  public ciclos = ['LARGO', 'INTERMEDIO', 'CORTO'];
  public enfermedades = [
    'Roya de la Hoja',
    'Mancha Amarilla',
    'Mancha de la Hoja',
    'Fusarium de la Espiga',
    'Roya del Maíz',
    'Roya Anaranjada',
    'Fin de Ciclo Soja',
  ];
  public cultivosDisponibles: Cultivo[] = [];
  private datos$?: Subscription;

  get resistencia(): FormArray {
    return this.form?.get('resistencia') as FormArray;
  }

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: SemillaService,
    public helper: HelperService,
    private router: Router,
    private listado: ListadosService,
  ) {}

  private crearControlResistencia(enfermedad = '', multiplicador: number | null = null): FormGroup {
    return new FormGroup({
      enfermedad: new FormControl(enfermedad, Validators.required),
      multiplicador: new FormControl(multiplicador, [Validators.required, Validators.min(0), Validators.max(1)]),
    });
  }

  private createForm(): void {
    const resistenciaControls = (this.semilla?.resistencia || []).map((r) =>
      this.crearControlResistencia(r.enfermedad, r.multiplicador)
    );

    this.form = new FormGroup({
      semillero: new FormControl(this.semilla?.semillero || '', Validators.required),
      cultivo: new FormControl(this.semilla?.cultivo || null, Validators.required),
      variedad: new FormControl(this.semilla?.variedad || '', Validators.required),
      ciclo: new FormControl(this.semilla?.ciclo || null, Validators.required),
      campania: new FormControl(this.semilla?.campania || ''),
      resistencia: new FormArray(resistenciaControls),
    });
  }

  public agregarResistencia(): void {
    this.resistencia.push(this.crearControlResistencia());
  }

  public borrarResistencia(index: number): void {
    this.resistencia.removeAt(index);
  }

  public async guardar(): Promise<void> {
    this.loading = true;
    try {
      const data: ICreateSemilla = {
        semillero: this.form?.value.semillero,
        cultivo: this.form?.value.cultivo,
        variedad: this.form?.value.variedad,
        ciclo: this.form?.value.ciclo,
        campania: this.form?.value.campania || undefined,
        resistencia: this.form?.value.resistencia,
      };
      if (this.semilla?._id) {
        await this.service.editar(this.semilla._id, data);

        // Solo actualiza el item en cache
        this.listado.patchEntityItem('semillas', {
          _id: this.semilla._id,
          ...data,
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);

        // Solo actualiza el item en cache
        this.listado.createEntityItem('semillas', created);

        this.helper.notifSuccess(this.translate.instant('Creado correctamente'));
      }

      this.volver();
    } catch (err) {
      console.error(err);
      this.helper.notifError(err);
    }
    this.loading = false;
  }

  public volver() {
    this.router.navigate(['semillas']);
  }

  async ngOnInit(): Promise<void> {   
    this.loading = true;
    this.semilla = this.paramsService.get('editSemilla') || undefined;
    this.titulo = this.semilla
      ? () => this.translate.instant('Editar semilla')
      : () => this.translate.instant('Crear semilla');
    this.createForm();
    await this.listarCultivos();
    this.loading = false;
  }

  // Método para obtener cultivos únicos desde semillas
  private async listarCultivos(): Promise<void> {
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0
    };
    this.datos$?.unsubscribe();
    this.datos$ = this.listado
      .subscribe<IListado<ISemilla>>('semillas', queryParams)
      .subscribe((data) => {
        // Extraer cultivos únicos del listado        
        const unicos = [...new Set(data.datos.map((s) => s.cultivo))];
        this.cultivosDisponibles = unicos as Cultivo[];        
      });
    await this.listado.getLastValue('semillas', queryParams);
  }

  ngOnDestroy(): void {
    this.datos$?.unsubscribe();
  }

}
