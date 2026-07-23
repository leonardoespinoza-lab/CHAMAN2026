import { Injectable } from '@angular/core';
import { ITenant } from 'modelos/src';

@Injectable({ providedIn: 'root' })
export class TenantThemeService {
  private readonly defaults = {
    primary: '#0f8f83',
    secondary: '#20d8ca',
    background: '#eef8f7',
  };
  private readonly defaultTitle = document.title || 'Chaman';
  private readonly themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  private readonly defaultThemeColor = this.themeColor?.content || '#072B2A';
  private readonly themedProperties = [
    '--tenant-primary',
    '--tenant-secondary',
    '--tenant-background',
    '--chaman-aqua',
    '--chaman-aqua-deep',
    '--chaman-ink',
    '--chaman-ink-soft',
    '--chaman-muted',
    '--chaman-paper',
    '--chaman-stone',
    '--chaman-glass-bg',
    '--chaman-glass-bg-strong',
    '--chaman-glass-bg-subtle',
    '--chaman-glass-border',
    '--chaman-field-border-strong',
    '--chaman-card-bg',
    '--chaman-card-bg-soft',
    '--chaman-card-border',
    '--chaman-card-border-hover',
    '--chaman-focus-ring',
    '--chaman-interactive-hover',
    '--chaman-chart-primary',
    '--chaman-chart-secondary',
    '--chaman-chart-tertiary',
    '--chaman-chart-text',
    '--chaman-chart-muted',
    '--chaman-chart-grid',
    '--chaman-chart-grid-soft',
    '--chaman-chart-axis',
    '--chaman-chart-crosshair',
    '--chaman-chart-tooltip-bg',
    '--chaman-chart-tooltip-border',
    '--chaman-page-background',
    '--p-primary-color',
    '--p-primary-contrast-color',
    '--p-accent-color',
    '--p-text-color',
    '--p-text-muted-color',
  ];

  apply(tenant?: ITenant): void {
    if (!tenant) {
      this.clear();
      return;
    }
    const branding = tenant.branding || {};
    const root = document.documentElement;
    const primary = this.color(branding.colorPrimario, this.defaults.primary);
    const secondary = this.color(branding.colorSecundario, this.defaults.secondary);
    const background = this.color(branding.colorFondo, this.defaults.background);
    const contrast = this.contrast(primary);
    const primaryDeep = this.mix(primary, '#071827', 0.28);
    const surface = this.mix(background, '#ffffff', 0.82);
    const surfaceStrong = this.mix(background, '#ffffff', 0.94);
    const surfaceSoft = this.mix(background, '#ffffff', 0.68);
    const text = this.contrast(surface);
    const textSoft = this.mix(text, surface, 0.2);
    const muted = this.mix(text, surface, 0.44);
    const tertiary = this.mix(primary, secondary, 0.5);
    const properties: Record<string, string> = {
      '--tenant-primary': primary,
      '--tenant-secondary': secondary,
      '--tenant-background': background,
      '--chaman-aqua': primary,
      '--chaman-aqua-deep': primaryDeep,
      '--chaman-ink': text,
      '--chaman-ink-soft': textSoft,
      '--chaman-muted': muted,
      '--chaman-paper': surfaceStrong,
      '--chaman-stone': surfaceSoft,
      '--chaman-glass-bg': this.rgba(surface, 0.72),
      '--chaman-glass-bg-strong': this.rgba(surfaceStrong, 0.86),
      '--chaman-glass-bg-subtle': this.rgba(surfaceSoft, 0.58),
      '--chaman-glass-border': this.rgba(muted, 0.25),
      '--chaman-field-border-strong': this.rgba(primary, 0.44),
      '--chaman-card-bg': this.rgba(surface, 0.72),
      '--chaman-card-bg-soft': this.rgba(surfaceSoft, 0.62),
      '--chaman-card-border': this.rgba(muted, 0.24),
      '--chaman-card-border-hover': this.rgba(primary, 0.4),
      '--chaman-focus-ring': this.rgba(primary, 0.3),
      '--chaman-interactive-hover': this.rgba(primary, 0.1),
      '--chaman-chart-primary': primary,
      '--chaman-chart-secondary': secondary,
      '--chaman-chart-tertiary': tertiary,
      '--chaman-chart-text': text,
      '--chaman-chart-muted': muted,
      '--chaman-chart-grid': this.rgba(muted, 0.18),
      '--chaman-chart-grid-soft': this.rgba(muted, 0.1),
      '--chaman-chart-axis': this.rgba(muted, 0.28),
      '--chaman-chart-crosshair': this.rgba(primary, 0.22),
      '--chaman-chart-tooltip-bg': this.rgba(surfaceStrong, 0.98),
      '--chaman-chart-tooltip-border': this.rgba(primary, 0.36),
      '--chaman-page-background': `radial-gradient(circle at 12% -12%, color-mix(in srgb, ${primary} 18%, transparent), transparent 34%), radial-gradient(circle at 96% 0%, color-mix(in srgb, ${secondary} 18%, transparent), transparent 38%), linear-gradient(135deg, color-mix(in srgb, ${background} 82%, white) 0%, ${background} 100%)`,
      '--p-primary-color': primary,
      '--p-primary-contrast-color': contrast,
      '--p-accent-color': secondary,
      '--p-text-color': text,
      '--p-text-muted-color': muted,
    };
    for (const [property, value] of Object.entries(properties)) {
      // La capa visual global define variables con !important. La identidad del
      // tenant debe tener la misma prioridad para heredarse en toda la aplicacion.
      root.style.setProperty(property, value, 'important');
    }
    document.title = branding.nombreAplicacion || tenant.nombre || 'Chaman';
    document.body.dataset['tenant'] = tenant.slug || '';
    root.dataset['tenant'] = tenant.slug || '';
    if (this.themeColor) this.themeColor.content = primary;
  }

  clear(): void {
    const root = document.documentElement;
    for (const property of this.themedProperties) {
      root.style.removeProperty(property);
    }
    delete document.body.dataset['tenant'];
    delete root.dataset['tenant'];
    document.title = this.defaultTitle;
    if (this.themeColor) this.themeColor.content = this.defaultThemeColor;
  }

  private color(value: string | undefined, fallback: string): string {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
  }

  private contrast(hex: string): string {
    const rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
    const luminance =
      (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return luminance > 0.56 ? '#071827' : '#ffffff';
  }

  private mix(from: string, to: string, toRatio: number): string {
    const source = this.rgb(from);
    const target = this.rgb(to);
    const ratio = Math.min(1, Math.max(0, toRatio));
    const mixed = source.map((value, index) =>
      Math.round(value * (1 - ratio) + target[index] * ratio),
    );
    return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  private rgba(hex: string, alpha: number): string {
    const [red, green, blue] = this.rgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  private rgb(hex: string): [number, number, number] {
    return [1, 3, 5].map((start) =>
      Number.parseInt(hex.slice(start, start + 2), 16),
    ) as [number, number, number];
  }
}
