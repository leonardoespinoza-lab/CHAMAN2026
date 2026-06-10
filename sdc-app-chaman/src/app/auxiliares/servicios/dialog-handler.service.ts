import { Injectable, Type } from '@angular/core';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';

export interface AppDialogConfig {
  header: string;
  width?: string;
  data?: any;
}

@Injectable({
  providedIn: 'root',
})
export class DialogHandlerService {
  constructor(private primeNgDialogService: DialogService) {}

  public open(component: Type<any>, config: AppDialogConfig): DynamicDialogRef | null {
    const dialogRef: DynamicDialogRef | null = this.primeNgDialogService.open(component, {
      header: config.header,
      width: config.width || '50%',
      contentStyle: { overflow: 'auto' },
      baseZIndex: 10000,
      data: config.data || {},

      // --- CONFIGURACIÓN DEL HEADER ---
      showHeader: true, // Asegura que el header sea visible
      closable: true, // Muestra el ícono 'x' en la esquina (true por defecto)
      focusOnShow: true, // Reactivamos el foco. Ahora se enfocará en el ícono 'x'
    });

    return dialogRef!;
  }
}
