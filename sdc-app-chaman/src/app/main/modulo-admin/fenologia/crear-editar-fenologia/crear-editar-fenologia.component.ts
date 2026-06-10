import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Cultivo, IFenologia, ICreateFenologia, IListado, IQueryParam, IPopulate, IDepartamento, ISemilla } from 'modelos/src';
import { FenologiaService } from '../../../../auxiliares/http/fenologia.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-crear-editar-fenologia',
  imports: [SharedModule],
  templateUrl: './crear-editar-fenologia.component.html',
  styleUrl: './crear-editar-fenologia.component.scss',
})
export class CrearEditarFenologiaComponent implements OnInit, OnDestroy {

  public loading = false;
  public fenologia?: IFenologia;
  public titulo?: () => string;
  public form!: FormGroup;
  public ciclos = ['LARGO', 'INTERMEDIO', 'CORTO'];  
  public departamentos$?: Subscription;
  private datos$?: Subscription;
  public departamentos: IDepartamento[] = [];
  public cultivosDisponibles: Cultivo[] = [];

  constructor(
    private paramsService: ParamsService,
    private translate: TranslateService,
    private service: FenologiaService,
    public helper: HelperService,
    private router: Router,
    private listado: ListadosService,
  ) {}

  // ========================
  // FORM
  // ========================

  get etapas(): FormArray {
    return this.form.get('etapas') as FormArray;
  }

  private crearEtapa(nombre: string = '', dias: number = 0): FormGroup {
    return new FormGroup({
      nombre: new FormControl(nombre, Validators.required),
      dias: new FormControl(dias, [Validators.required, Validators.min(0)])
    });
  }

  private createForm(): void {
    const etapasIniciales = this.fenologia?.etapas
      ? Object.entries(this.fenologia.etapas).map(([key, value]) =>
          this.crearEtapa(key, value as number)
        )
      : [];

    this.form = new FormGroup({
      cultivo: new FormControl(this.fenologia?.cultivo || null, Validators.required),
      departamento: new FormControl(
        this.fenologia?.departamento?._id || null,
        Validators.required
      ),
      ciclo: new FormControl(
        this.fenologia?.ciclo?.trim().toUpperCase() || null,
        Validators.required
      ),
      diaSiembra: new FormControl(this.fenologia?.diaSiembra || null),
      mesSiembra: new FormControl(this.fenologia?.mesSiembra || null),
      etapas: new FormArray(etapasIniciales)
    });  
  }

  public agregarEtapa(): void {
    this.etapas.push(this.crearEtapa());
  }

  public borrarEtapa(index: number): void {
    this.etapas.removeAt(index);
  }

  // ========================
  // SAVE
  // ========================

  private getData(): ICreateFenologia {
    const formValue = this.form.value;

    const etapasObj: Record<string, number> = formValue.etapas.reduce(
      (acc: Record<string, number>, e: any) => {
        if (e.nombre) {
          acc[e.nombre] = Number(e.dias) || 0;
        }
        return acc;
      },
      {}
    );

    return {
      cultivo: formValue.cultivo,
      idDepartamento: formValue.departamento,
      ciclo: formValue.ciclo,
      diaSiembra: formValue.diaSiembra,
      mesSiembra: formValue.mesSiembra,
      etapas: etapasObj
    };
  }

  public async guardar(): Promise<void> {
    this.loading = true;

    try {
      const data = this.getData();

      if (this.fenologia?._id) {
        const updated = await this.service.editar(this.fenologia._id, data);

        // Buscar el departamento completo en memoria
        const depto = this.departamentos.find(
          (d) => d._id === updated.idDepartamento
        );

        // reconstruir objeto
        const completo = {
          ...updated,
          departamento: depto
        };

        this.listado.patchEntityItem('fenologias', {
          _id: this.fenologia._id,
          ...completo
        });

        this.helper.notifSuccess(this.translate.instant('Editado correctamente'));
      } else {
        const created = await this.service.crear(data);

        // Buscar el departamento en memoria
        const depto = this.departamentos.find(
          (d) => String(d._id) === String(created.idDepartamento)
        );

        // Reconstruir objeto completo
        const completo = {
          ...created,
          departamento: depto
        };

        this.listado.createEntityItem('fenologias', completo);
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
    this.router.navigate(['fenologias']);
  }

  // ========================
  // LISTADOS
  // ========================

  private async listarDepartamentos(): Promise<void> {
    const populate: IPopulate = {
      path: 'provincia',
      select: 'nombre',
    };
    const queryParams: IQueryParam = {
      page: 0,
      limit: 0,
      sort: 'nombre',
      populate: JSON.stringify(populate),
    };

    this.departamentos$?.unsubscribe();
    this.departamentos$ = this.listado
      .subscribe<IListado<IDepartamento>>('departamentos', queryParams)
      .subscribe(async (data) => {
        this.departamentos = data.datos;
        console.log(`listado de departamentos`, data);
      });
    await this.listado.getLastValue('departamentos', queryParams);
  }

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

  // ========================
  // LIFECYCLE
  // ========================

  async ngOnInit(): Promise<void> {
    this.loading = true;

    this.fenologia = this.paramsService.get('editFenologia') || undefined;

    this.titulo = this.fenologia
      ? () => this.translate.instant('Editar fenología')
      : () => this.translate.instant('Crear fenología');

    this.createForm();
    await this.listarDepartamentos();
    await this.listarCultivos();

    this.loading = false;
  }

  ngOnDestroy(): void {
    this.datos$?.unsubscribe();
  }
}