import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PrimeNgModule } from './primeNg.module';

@NgModule({
  imports: [],
  exports: [CommonModule, RouterModule, PrimeNgModule, TranslateModule, FormsModule, ReactiveFormsModule],
  providers: [],
})
export class SharedModule {}
