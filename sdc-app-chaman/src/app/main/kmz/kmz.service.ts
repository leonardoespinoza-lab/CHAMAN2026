import { Injectable } from '@angular/core';
import { featureItem } from './kmz.component';

@Injectable({
  providedIn: 'root',
})
export class KMZService {
  public file: File | null = null;

  public listaPoligonos: featureItem[] = [];
  public listaPuntos: featureItem[] = [];
  public listaLineas: featureItem[] = [];

  public reset() {
    this.file = null;
    this.listaPoligonos = [];
    this.listaPuntos = [];
    this.listaLineas = [];
  }
}
