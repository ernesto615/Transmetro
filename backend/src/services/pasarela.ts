// Adaptador de pasarela de pago. Hoy es una SIMULACIÓN: aprueba cualquier monto válido.
// En producción se reemplaza por el proveedor real (p. ej. Stripe con webhooks firmados)
// sin tocar el resto del sistema. Nunca se reciben ni guardan datos de tarjetas bancarias aquí.
export interface ResultadoPago { aprobado: boolean; codigo: string }

export interface Pasarela {
  autorizar(monto: number, referencia: string): Promise<ResultadoPago>;
}

export const pasarelaSimulada: Pasarela = {
  async autorizar(monto, referencia) {
    return { aprobado: monto > 0, codigo: `SIM-${referencia.slice(0, 8).toUpperCase()}` };
  },
};

export const pasarela: Pasarela = pasarelaSimulada;
