import { Injectable } from '@angular/core';

export interface IParamsService {
  [key: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class ParamsService {
  private currentParams: IParamsService = {};

  constructor() {
    const params = localStorage.getItem('params');
    if (params) {
      this.currentParams = JSON.parse(params);
    } else {
      this.currentParams = {};
    }
  }

  public set(key: string, value: any): void {
    this.currentParams[key] = value;
    localStorage.setItem('params', JSON.stringify(this.currentParams));
    console.log('params', this.currentParams);
  }

  public get(key: string): IParamsService | undefined {
    return this.currentParams[key];
  }

  public remove(key: string): void {
    delete this.currentParams[key];
    localStorage.setItem('params', JSON.stringify(this.currentParams));
  }

  // public clear(): void {
  //   localStorage.removeItem('params');
  //   this.currentParams = {};
  // }
}
