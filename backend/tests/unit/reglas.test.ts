import { describe, it, expect } from '@jest/globals';
import { limitesBuses } from '../../src/services/lineas.js';
import { haversineKm } from '../../src/services/lineas.js';
import { calcularOcupacion } from '../../src/services/capacidad.js';
import { toCsv } from '../../src/services/reportes.js';

describe('Rango de buses por línea (RF-3)', () => {
  it('permite entre N y 2N buses', () => {
    expect(limitesBuses(4)).toEqual({ min: 4, max: 8 });
    expect(limitesBuses(3)).toEqual({ min: 3, max: 6 });
  });
});

describe('Umbrales de ocupación (RF-7)', () => {
  const CAP = 120;
  it('genera sobrecupo con 150 % o más de pasajeros en espera', () => {
    expect(calcularOcupacion(180, CAP).sobrecupo).toBe(true); // exactamente 150 %
    expect(calcularOcupacion(200, CAP).sobrecupo).toBe(true);
  });
  it('no genera sobrecupo justo debajo del 150 %', () => {
    expect(calcularOcupacion(179, CAP).sobrecupo).toBe(false);
  });
  it('agrega 5 minutos de espera si el bus lleva menos del 25 %', () => {
    expect(calcularOcupacion(10, CAP, 29).esperaAdicionalMin).toBe(5); // 24.2 %
    expect(calcularOcupacion(10, CAP, 0).esperaAdicionalMin).toBe(5);
  });
  it('no agrega espera desde el 25 % en adelante', () => {
    expect(calcularOcupacion(10, CAP, 30).esperaAdicionalMin).toBe(0); // exactamente 25 %
    expect(calcularOcupacion(10, CAP, 100).esperaAdicionalMin).toBe(0);
  });
  it('sin dato de pasajeros a bordo no aplica la espera adicional', () => {
    const r = calcularOcupacion(10, CAP);
    expect(r.ocupacionBus).toBeNull();
    expect(r.esperaAdicionalMin).toBe(0);
  });
});

describe('Distancia en línea recta', () => {
  it('es cero entre el mismo punto', () => {
    expect(haversineKm(14.6, -90.5, 14.6, -90.5)).toBe(0);
  });
  it('un grado de latitud equivale a unos 111 km', () => {
    expect(haversineKm(14, -90, 15, -90)).toBeCloseTo(111.19, 1);
  });
});

describe('Exportación a CSV (RF-10)', () => {
  it('antepone BOM para que Excel respete los acentos', () => {
    expect(toCsv([{ linea: 'Línea 1' }]).startsWith('\uFEFF')).toBe(true);
  });
  it('escapa comas y comillas', () => {
    const csv = toCsv([{ a: 'uno, dos', b: 'dice "hola"' }]);
    expect(csv).toContain('"uno, dos"');
    expect(csv).toContain('"dice ""hola"""');
  });
  it('devuelve solo el BOM si no hay filas', () => {
    expect(toCsv([])).toBe('\uFEFF');
  });
});
