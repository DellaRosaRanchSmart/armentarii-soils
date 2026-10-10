# Instalación (una sola vez, ~20 minutos)

## 1. Preparar la hoja `Sistema_Agronomia_Digital`

1. Abra la hoja → **Extensiones › Apps Script**.
2. Borre el contenido de `Código.gs` y pegue todo el archivo [`apps-script/Code.gs`](../apps-script/Code.gs). Guarde.
3. En el selector de funciones elija **`setup`** y pulse **Ejecutar**. Google pedirá permisos (hoja y Drive): acéptelos.
   `setup` **no borra nada**; solo:
   - crea las pestañas que falten y agrega al final las columnas que falten;
   - agrega la columna **`Area_Ha`** a `5_Catalogos` (para el área de cada potrero);
   - crea la carpeta de Drive `Sistema_Agronomia_Digital_Fotos`;
   - genera la **clave (token)** de la app. Se ve en *Registro de ejecución* y, al recargar la hoja, en el menú **Agronomía Digital › Ver clave**.
4. **Implementar › Nueva implementación** → tipo **Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier persona** (la clave protege la escritura).
   Copie la **URL que termina en `/exec`**.

> Si más adelante cambia el código: **Implementar › Gestionar implementaciones › ✏️ › Versión: nueva**. Así la URL no cambia.

### Pestaña de arvenses
El script acepta `2_Arvenses` o `2_Arvenses_Punto` (en su mensaje aparecen los dos nombres). Use uno solo.

### Llenar `5_Catalogos`
La app lee esta pestaña para las listas desplegables y la guarda en el teléfono para usarla sin señal.

| Categoria | Nombre_Item | Descripcion_Cientifica | Area_Ha |
|---|---|---|---|
| Potrero | Potrero 1 | | 4.2 |
| Potrero | La Ceiba | | |
| Pasto | Angleton | *Dichanthium aristatum* | |
| Arvense | Escoba | *Sida acuta* | |
| Responsable | Juan Pérez | | |

- Si un potrero tiene `Area_Ha`, el aforo la completa sola (se puede editar). Si no, el aforo reporta solo kg/ha.
- Categorías que reemplazan las listas por defecto de la app (si las crea): `Clima`, `Estado`, `Color`, `Abundancia`,
  `Compactacion`, `Erosion`, `Encharcamiento`, `Costra_Superficial`, `Actividad_Bio`, `Pisoteo`, `Pedregosidad`.
  Por defecto las escalas de campo son *Nula / Baja / Media / Alta* y la abundancia *Escasa / Moderada / Abundante / Dominante*.
- Los ejemplos de la tabla son ilustrativos: ponga los potreros y especies reales de la finca.

### Columnas opcionales (recomendadas para Looker Studio)
La app envía datos extra que **solo se escriben si usted crea la columna** (con ese nombre exacto, en cualquier posición):

| Pestaña | Columna | Para qué |
|---|---|---|
| 1_Puntos_Muestreo, 3_Aforos_Cabecera, 2_Arvenses, 4_Aforos_Detalle | `Fecha` | Filtrar por fecha sin tener que combinar con 0_Jornadas |
| 2_Arvenses, 4_Aforos_Detalle | `Potrero` | Analizar arvenses / marcos por potrero sin combinar |
| 1_Puntos_Muestreo | `Precision_GPS_m` | Precisión del GPS en metros |
| 3_Aforos_Cabecera | `N_Muestras`, `CV_Porc` | Número de marcos y variabilidad |

**No ponga fórmulas dentro de estas pestañas**: el script reescribe los valores. Si necesita cálculos, hágalos en otra pestaña o en Looker.

## 2. Publicar la app (GitHub Pages)

La app necesita HTTPS para usar el GPS y funcionar sin conexión.

1. En GitHub: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
2. Haga merge de esta rama a `main`. El flujo `.github/workflows/pages.yml` publica la carpeta `app/`.
3. La dirección queda así: `https://<usuario-u-organización>.github.io/armentarii-soils/`.

## 3. Configurar cada celular

1. Abra la dirección en **Chrome (Android)** o **Safari (iPhone)** con señal.
2. **Agregar a pantalla de inicio** (queda como una app).
3. **⚙️ Ajustes** → pegue la URL `/exec` y la clave → **Probar conexión** → **Actualizar catálogos**.
4. Abra una vez el **📊 Dashboard** con señal para que quede guardado.

Desde ahí se puede capturar sin señal. Al volver la conexión la app sincroniza sola, o con **⟳ Sincronizar**.

## Recomendaciones de uso en campo

- Capture el GPS a cielo abierto y espere a que la precisión baje (ideal ≤ 10 m).
- No borre los datos del navegador ni desinstale la app con datos pendientes. Ante la duda: **Ajustes › Exportar respaldo**.
- El tamaño del marco queda guardado del último aforo (por defecto 0,25 m²; cámbielo si usa otro).
- Fotos públicas: por defecto las fotos de Drive solo las ven quienes tengan acceso a la carpeta. Para mostrarlas
  como imagen en Looker Studio cambie `PHOTOS_PUBLIC = true` en `Code.gs` (cualquiera con el enlace podrá verlas).
