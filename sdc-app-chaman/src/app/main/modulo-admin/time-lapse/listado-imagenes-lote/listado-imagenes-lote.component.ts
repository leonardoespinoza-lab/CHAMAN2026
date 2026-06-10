import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { IFoto, IListado, ILote, IQueryParam } from 'modelos/src';
import { MessageService } from 'primeng/api';
import { TableLazyLoadEvent } from 'primeng/table';
import { Subscription } from 'rxjs';
import { FotoService } from '../../../../auxiliares/http/foto.service';
import { HelperService } from '../../../../auxiliares/servicios/helper';
import { ListadosService } from '../../../../auxiliares/servicios/listados';
import { ParamsService } from '../../../../auxiliares/servicios/params.service';
import { SharedModule } from '../../../../auxiliares/shared.module';

@Component({
  selector: 'app-listado-imagenes-lote',
  imports: [SharedModule],
  templateUrl: './listado-imagenes-lote.component.html',
  styleUrl: './listado-imagenes-lote.component.scss',
  providers: [MessageService],
})
export class ListadoImagenesLoteComponent implements OnInit, OnDestroy {
  public loading = false;
  public imagenUrl: string | undefined = '';

  public name = ListadoImagenesLoteComponent.name;
  public datos: IFoto[] = [];
  public totalCount = 0;
  public visible = false;
  public idLote = '';
  public lote: ILote | null = null;

  public datos$?: Subscription;
  public currentImageIndex: number = 0;

  get user() {
    return this.helper.user;
  }

  constructor(
    public helper: HelperService,
    private listado: ListadosService,
    private route: ActivatedRoute,
    private http: HttpClient,
    private fotosService: FotoService,
    private messageService: MessageService,
    private params: ParamsService
  ) {}

  public async ver(data: IFoto) {
    this.currentImageIndex = this.datos.findIndex((item) => item._id === data._id);
    this.imagenUrl = data.url || '';
    // this.router.navigate(['time-lapse', 'asignar-camara']);
    this.visible = true;
  }

  public nextImage() {
    if (this.currentImageIndex < this.datos.length - 1) {
      this.currentImageIndex++;
      this.imagenUrl = this.datos[this.currentImageIndex].url;
    }
  }

  public prevImage() {
    if (this.currentImageIndex > 0) {
      this.currentImageIndex--;
      this.imagenUrl = this.datos[this.currentImageIndex].url;
    }
  }

  async downloadImage(url: string, filename: string) {
    if (Capacitor.getPlatform() === 'web') {
      // Navegador → descarga normal
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      try {
        const blob = await this.fotosService.getImagen(url);
        // Convertir Blob → Base64 puro
        const base64Data = this.bufferToBase64(blob.data);
        const timestamp = new Date(filename).getTime();
        const fileUri = await this.guardarImagen(base64Data, `${timestamp}.jpg`);
        this.messageService.add({
          severity: 'info',
          summary: 'Info',
          detail: `Imagen guardada en ${fileUri}`,
          life: 3000,
        });
        // await Share.share({
        //   title: 'Guardar Imagen',
        //   text: 'Elige dónde guardar la imagen',
        //   url: fileUri, // ahora sí funciona
        // });

        // console.log('✅ Archivo guardado en:', file.uri);
      } catch (err) {
        console.error('❌ Error al descargar', err);
        console.log('❌ Detalle:', JSON.stringify(err, null, 2));
      }
    }
  }

  private bufferToBase64(buffer: ArrayBuffer, mimeType: string = 'image/jpeg'): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
  }

  private async guardarImagen(base64Data: string, nombreArchivo: string) {
    // const nombreArchivo = `imagen_${Date.now()}.png`;
    await this.crearCarpeta('FotosTimeLapse');
    await this.crearCarpeta(`FotosTimeLapse/${this.lote!.nombre}`);
    const res = await Filesystem.writeFile({
      directory: Directory.Documents,
      path: `FotosTimeLapse/${this.lote!.nombre}/${nombreArchivo}`,
      data: base64Data.replace(/^data:image\/\w+;base64,/, ''),
    });
    return res.uri;
  }

  public async crearCarpeta(path: string): Promise<void> {
    try {
      await Filesystem.mkdir({
        directory: Directory.Documents,
        path,
        recursive: true,
      });
      console.log(`✅ Carpeta creada en: ${path}`);
    } catch (err: any) {
      // Ignorar si la carpeta ya existe
      if (err?.message?.includes('already exists') || err?.code === 'OS-PLUG-FILE-0010') {
        console.log(`ℹ️ Carpeta ya existente en: ${path}`);
        return;
      }

      // Otros errores sí se reportan
      console.error('❌ Error creando carpeta:', err);
      throw err;
    }
  }

  // Listados

  async listarLazy(event: TableLazyLoadEvent): Promise<void> {
    this.loading = true;

    let page = event.first ? event.first / (event.rows || 10) : 0;
    const limit = event.rows || 10;

    console.log('event', event);
    const filtro = { idLote: this.idLote };
    const queryParams: IQueryParam = {
      page,
      limit,
      filter: JSON.stringify(filtro),
      sort: event.sortField ? `${event.sortOrder === 1 ? '+' : '-'}${event.sortField}` : '-fechaCreacion',
    };
    console.log('queryParams', queryParams);

    this.datos$?.unsubscribe();
    this.datos$ = this.listado.subscribe<IListado<IFoto>>('fotos', queryParams).subscribe((data) => {
      this.totalCount = data.totalCount;
      this.datos = data.datos;
      console.log(`listado de fotos`, data);
      this.loading = false;
    });

    await this.listado.getLastValue('fotos', queryParams);
  }

  public async ngOnInit() {
    this.loading = true;
    this.lote = this.params.get('Lote') as ILote;
    console.log('lote desde params', this.lote);
    this.idLote = this.route.snapshot.paramMap.get('id') || '';
    // await Promise.all([this.listar()]);

    this.loading = false;
  }

  ngOnDestroy(): void {
    this.datos$?.unsubscribe();
  }
}
