-- =====================================================================
-- Reglas de negocio aplicadas EN la base de datos (segunda línea de defensa).
-- La API ya las valida en services/, pero así nadie puede saltárselas con un INSERT manual.
-- Ejecutar DESPUÉS de 01_esquema.sql y ANTES de cargar datos.
-- =====================================================================

-- Regla: una línea admite entre N y 2N buses, siendo N su número de estaciones.

-- (a) Al asignar un bus a una línea: no superar el máximo (2N)
CREATE OR REPLACE FUNCTION fn_bus_validar_linea() RETURNS trigger AS $$
DECLARE n INT; actuales INT;
BEGIN
  IF NEW.id_linea IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id_linea IS NOT DISTINCT FROM OLD.id_linea THEN RETURN NEW; END IF;
  END IF;
  SELECT COUNT(*) INTO n FROM linea_estacion WHERE id_linea = NEW.id_linea;
  IF n = 0 THEN
    RAISE EXCEPTION 'La línea % no tiene estaciones; defina su recorrido antes de asignarle buses', NEW.id_linea;
  END IF;
  SELECT COUNT(*) INTO actuales FROM bus WHERE id_linea = NEW.id_linea AND id_bus <> COALESCE(NEW.id_bus, -1);
  IF actuales + 1 > n * 2 THEN
    RAISE EXCEPTION 'La línea % ya tiene el máximo de buses permitido (% = 2 x % estaciones)', NEW.id_linea, n * 2, n;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bus_validar_linea ON bus;
CREATE TRIGGER trg_bus_validar_linea BEFORE INSERT OR UPDATE OF id_linea ON bus
  FOR EACH ROW EXECUTE FUNCTION fn_bus_validar_linea();

-- (b) Al sacar un bus de una línea (cambio de línea o borrado): no bajar del mínimo (N)
CREATE OR REPLACE FUNCTION fn_validar_salida_linea(p_linea INT) RETURNS void AS $$
DECLARE n INT; actuales INT;
BEGIN
  IF p_linea IS NULL THEN RETURN; END IF;
  SELECT COUNT(*) INTO n FROM linea_estacion WHERE id_linea = p_linea;
  SELECT COUNT(*) INTO actuales FROM bus WHERE id_linea = p_linea;
  IF n > 0 AND actuales = n THEN
    RAISE EXCEPTION 'La línea % quedaría con menos buses que estaciones (mínimo %)', p_linea, n;
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_bus_salida_update() RETURNS trigger AS $$
BEGIN
  IF OLD.id_linea IS NOT NULL AND NEW.id_linea IS DISTINCT FROM OLD.id_linea THEN
    PERFORM fn_validar_salida_linea(OLD.id_linea);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_bus_salida_delete() RETURNS trigger AS $$
BEGIN
  PERFORM fn_validar_salida_linea(OLD.id_linea);
  RETURN OLD;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bus_salida_update ON bus;
CREATE TRIGGER trg_bus_salida_update BEFORE UPDATE OF id_linea ON bus
  FOR EACH ROW EXECUTE FUNCTION fn_bus_salida_update();
DROP TRIGGER IF EXISTS trg_bus_salida_delete ON bus;
CREATE TRIGGER trg_bus_salida_delete BEFORE DELETE ON bus
  FOR EACH ROW EXECUTE FUNCTION fn_bus_salida_delete();

-- Regla: la distancia total de la línea es la suma de los tramos entre estaciones.
CREATE OR REPLACE FUNCTION fn_actualizar_distancia_linea() RETURNS trigger AS $$
DECLARE l INT;
BEGIN
  IF TG_OP = 'DELETE' THEN l := OLD.id_linea; ELSE l := NEW.id_linea; END IF;
  UPDATE linea
     SET distancia_total_km = (SELECT COALESCE(SUM(distancia_a_siguiente_km), 0) FROM linea_estacion WHERE id_linea = l)
   WHERE id_linea = l;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_distancia_linea ON linea_estacion;
CREATE TRIGGER trg_distancia_linea AFTER INSERT OR UPDATE OR DELETE ON linea_estacion
  FOR EACH ROW EXECUTE FUNCTION fn_actualizar_distancia_linea();

-- Reglas que ya cubre el propio esquema (01_esquema.sql):
--   * bus.id_parqueo NOT NULL            -> un bus nunca queda sin parqueo
--   * bus.id_linea es una sola columna   -> un bus pertenece a una sola línea
--   * tarjeta_acceso.saldo CHECK >= 0    -> no hay saldo negativo
--   * transaccion.referencia UNIQUE      -> un reintento no cobra dos veces
