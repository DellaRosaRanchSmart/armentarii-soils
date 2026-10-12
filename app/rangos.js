/* Rangos de referencia para el diagnóstico de suelos del dashboard.
   [columna de la hoja, nombre, grupo, unidad, mínimo, máximo, fuente]
   null = sin límite por ese lado. Si mínimo y máximo son null, el parámetro se muestra "sin rango definido".

   Fuente de los valores por defecto: rangos "óptimos" impresos en los informes del sensor SOILO
   configurado para "Pasture Grass" (informe #8CB97C23, 18 sep 2026). SOILO NO publica rangos para
   Ca, Mg, S ni micronutrientes; esos quedan vacíos hasta que el agrónomo o el laboratorio los defina.

   Para cambiarlos sin tocar el código: en 5_Catalogos agregue filas con
   Categoria = Rango_Suelo · Nombre_Item = columna (p. ej. Zn_ppm) · Descripcion_Cientifica = "mín-máx"
   (ejemplos: "1.5-3", ">0.75", "<2000"). Esas filas tienen prioridad sobre esta lista. */
const RANGOS_SUELO = [
  // pH: SOILO imprime 6,0–7,5 (rango genérico de cultivos). Para pastos tropicales se usa 5,5–6,5: por debajo de ~5,5
  // el aluminio se vuelve soluble y tóxico. Referencia general; validar con el agrónomo (SOILO no mide aluminio).
  ['pH', 'pH', 'Acidez', '', 5.5, 6.5, 'Ref. general pastos tropicales (validar)'],
  ['N_ppm', 'Nitrógeno (N)', 'Macro', 'ppm', 39.3, 150, 'SOILO (Pasture Grass)'],
  ['P_ppm', 'Fósforo (P)', 'Macro', 'ppm', 4.7, 100, 'SOILO (Pasture Grass)'],
  ['K_ppm', 'Potasio (K)', 'Macro', 'ppm', 21.2, 400, 'SOILO (Pasture Grass)'],
  ['Ca_ppm', 'Calcio (Ca)', 'Macro', 'ppm', null, null, ''],
  ['Mg_ppm', 'Magnesio (Mg)', 'Macro', 'ppm', null, null, ''],
  ['S_ppm', 'Azufre (S)', 'Macro', 'ppm', null, null, ''],
  ['MO_porc', 'Materia orgánica', 'Orgánica', '%', 0.75, null, 'SOILO (Pasture Grass)'],
  ['Salinidad', 'Salinidad (CE)', 'Salinidad', 'µS/cm', null, 2000, 'SOILO (Pasture Grass)'],
  ['B_ppm', 'Boro (B)', 'Micro', 'ppm', null, null, ''],
  ['Cu_ppm', 'Cobre (Cu)', 'Micro', 'ppm', null, null, ''],
  ['Fe_ppm', 'Hierro (Fe)', 'Micro', 'ppm', null, null, ''],
  ['Mn_ppm', 'Manganeso (Mn)', 'Micro', 'ppm', null, null, ''],
  ['Mo_ppm', 'Molibdeno (Mo)', 'Micro', 'ppm', null, null, ''],
  ['Zn_ppm', 'Zinc (Zn)', 'Micro', 'ppm', null, null, ''],
];
