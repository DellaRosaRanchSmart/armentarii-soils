# Agronomía Digital · Ganadería El Rosario

App para capturar en campo (**sin internet**) muestras de suelo, arvenses y aforos por potrero,
que se sincroniza con la hoja de Google **`Sistema_Agronomia_Digital`** y alimenta un dashboard
(el propio de la app y/o Looker Studio).

```
Celular (app web instalable, funciona offline)
   │  guarda todo en el teléfono (IndexedDB) + fotos comprimidas
   │  ⟳ Sincronizar cuando hay señal
   ▼
Google Apps Script (apps-script/Code.gs, vinculado a la hoja)
   ├─ escribe/actualiza filas en 0_Jornadas … 4_Aforos_Detalle (sin duplicar)
   ├─ guarda fotos en Drive › Sistema_Agronomia_Digital_Fotos/<jornada>
   └─ entrega 5_Catalogos (potreros, pastos, arvenses…) para usar sin señal
   ▼
Dashboards: app/dashboard.html  ·  Looker Studio (docs/GUIA_LOOKER_STUDIO.md)
```

## Qué hace

| Módulo | Detalle |
|---|---|
| **Jornada** | Fecha, responsable, clima, lluvia 24 h, estado, notas. Agrupa puntos y aforos. |
| **Punto de suelo** | GPS del teléfono (funciona sin datos; toma la mejor lectura hasta ±8 m o 25 s), potrero, observación de campo (compactación, erosión, pisoteo…), pasto, fotos de suelo y panorámica. El **análisis de laboratorio** se puede dejar vacío y completar cuando lleguen los resultados: al guardar se vuelve a sincronizar y se actualiza la misma fila. |
| **Arvenses** | Lista dinámica por punto: nombre, cobertura %, abundancia, foto. |
| **Aforo por potrero** | Número **libre** de marcos (2, 3, 10…). Calcula en vivo: promedio g/marco, **kg FV/ha = (promedio g ÷ m² del marco) × 10**, y si el potrero tiene área, **oferta total = kg/ha × ha**. Sin área, se reporta solo kg/ha. Muestra el CV % entre marcos y avisa si es > 40 %. GPS opcional por marco. |
| **Sincronización** | IDs generados en el teléfono → reenviar no duplica. Si se edita o borra un punto/aforo ya enviado, la hoja se actualiza (los marcos y arvenses del registro se reemplazan completos). |
| **Respaldo** | Exportar todo (con fotos) a un JSON desde Ajustes. |

## Estructura

```
app/                 App web (PWA) – se publica en GitHub Pages
  index.html app.js  Captura
  dashboard.*        Dashboard (Fertilidad · Forrajes · Botánica)
  common.js          Base de datos local, API, cálculo de aforo
  sw.js              Modo sin conexión
  vendor/            Chart.js 4.4.1 y Leaflet 1.9.4 (MIT), incluidos para funcionar offline
apps-script/Code.gs  Backend que escribe en la hoja
docs/INSTALACION.md  Paso a paso de instalación
docs/GUIA_LOOKER_STUDIO.md
```

Empiece por **[docs/INSTALACION.md](docs/INSTALACION.md)**.
