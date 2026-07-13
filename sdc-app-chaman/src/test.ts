import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { importProvidersFrom } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogService, DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { of } from 'rxjs';
import { WebSocketService } from './app/auxiliares/servicios/websocket';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting(), {
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});

const websocketStub = {
  initWs: () => undefined,
  closeWS: () => undefined,
  getMessage: () => of(),
};

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      importProvidersFrom(TranslateModule.forRoot()),
      ConfirmationService,
      MessageService,
      DialogService,
      { provide: DynamicDialogConfig, useValue: { data: {} } },
      { provide: DynamicDialogRef, useValue: { close: () => undefined } },
      { provide: WebSocketService, useValue: websocketStub },
    ],
  });
});
