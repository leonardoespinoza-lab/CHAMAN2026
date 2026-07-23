import { TestBed } from '@angular/core/testing';
import { ITenant } from 'modelos/src';
import { TenantThemeService } from './tenant-theme.service';

describe('TenantThemeService', () => {
  let service: TenantThemeService;
  const originalTitle = document.title;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TenantThemeService);
  });

  afterEach(() => {
    service.clear();
    document.title = originalTitle;
  });

  it('aplica la identidad visual con prioridad global', () => {
    service.apply({
      nombre: 'John Deere',
      slug: 'john-deere',
      branding: {
        nombreAplicacion: 'John Deere Campo',
        colorPrimario: '#367c2b',
        colorSecundario: '#ffde00',
        colorFondo: '#f6f8ef',
      },
    } as ITenant);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--p-primary-color')).toBe('#367c2b');
    expect(root.style.getPropertyPriority('--p-primary-color')).toBe('important');
    expect(root.style.getPropertyValue('--chaman-aqua')).toBe('#367c2b');
    expect(root.style.getPropertyValue('--chaman-chart-primary')).toBe('#367c2b');
    expect(root.style.getPropertyValue('--chaman-chart-secondary')).toBe('#ffde00');
    expect(root.style.getPropertyValue('--chaman-chart-tertiary')).toBe('#9bad16');
    expect(root.style.getPropertyValue('--chaman-card-border-hover')).toBe(
      'rgba(54, 124, 43, 0.4)',
    );
    expect(root.style.getPropertyValue('--p-text-color')).not.toBe('');
    expect(root.dataset['tenant']).toBe('john-deere');
    expect(document.title).toBe('John Deere Campo');
  });

  it('restaura Chaman al salir del tenant', () => {
    service.apply({
      nombre: 'John Deere',
      slug: 'john-deere',
      branding: { colorPrimario: '#367c2b' },
    } as ITenant);

    service.clear();

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--p-primary-color')).toBe('');
    expect(root.style.getPropertyValue('--chaman-chart-primary')).toBe('');
    expect(root.style.getPropertyValue('--chaman-card-bg')).toBe('');
    expect(root.dataset['tenant']).toBeUndefined();
  });
});
