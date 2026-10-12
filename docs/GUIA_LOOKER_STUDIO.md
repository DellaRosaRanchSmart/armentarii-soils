# Informe para gerencia en Looker Studio

Informe con gráficos y análisis que lee directamente la hoja **Sistema_Agronomia_Digital** (siempre al día)
y se envía por correo **lunes, miércoles y viernes por la tarde**.

> Los nombres de botones pueden variar un poco según la versión de Looker Studio. Si algo no coincide, avíseme qué ve.

---

## 0. Antes de empezar (una vez)

1. En Apps Script tenga pegado el `Code.gs` actual, ejecute **`setup`** y publique con
   **Implementar › Gestionar implementaciones › ✏️ › Nueva versión**.
   Así la hoja tiene todas las columnas que usa este informe (`Fecha`, `Ultimo_Aforo`, capacidad de carga, etc.).
2. Que haya al menos una sincronización hecha desde la app (para que esas columnas tengan datos).

---

## 1. Conectar las pestañas (fuentes de datos)

1. Entre a **https://lookerstudio.google.com** con la misma cuenta de Google dueña de la hoja.
2. **Crear › Fuente de datos › Hojas de cálculo de Google** → elija **Sistema_Agronomia_Digital** →
   pestaña **1_Puntos_Muestreo** → deje marcado *"Usar la primera fila como encabezados"* → **Conectar**.
3. En la lista de campos revise el **Tipo**:

   | Campo | Tipo | Agregación |
   |---|---|---|
   | `Fecha` | Fecha | — |
   | `Ubicacion` | **Geo › Latitud, longitud** | — |
   | `pH`, `N_ppm` … `Zn_ppm`, `MO_porc`, `Salinidad`, `*_Porc` | Número | **Promedio** |
   | `Potrero`, `ID_Punto`, `Color`, `Compactacion`… | Texto | — |

4. **Agregar campos calculados** (botón *Agregar un campo*). Rangos = los de la app: pH 5,5 – 6,5
   (referencia general para pastos tropicales; por debajo de 5,5 aumenta el riesgo de aluminio) y, para nutrientes,
   los óptimos de SOILO para pasto. Cámbielos si el agrónomo define otros:

   **Estado_pH**
   ```
   CASE
     WHEN pH IS NULL THEN "Sin dato"
     WHEN pH < 5.5 THEN "↓ Bajo"
     WHEN pH > 6.5 THEN "↑ Alto"
     ELSE "✓ Adecuado"
   END
   ```
   **Fuera_pH** (1 si está fuera de rango; su *Promedio* = % de puntos fuera de rango)
   ```
   CASE WHEN pH IS NULL THEN NULL WHEN pH < 5.5 OR pH > 6.5 THEN 1 ELSE 0 END
   ```
   Repita la idea para los demás (mínimo – máximo):

   | Campo | Rango | Fórmula de "Fuera_" |
   |---|---|---|
   | `N_ppm` | 39,3 – 150 | `CASE WHEN N_ppm IS NULL THEN NULL WHEN N_ppm < 39.3 OR N_ppm > 150 THEN 1 ELSE 0 END` |
   | `P_ppm` | 4,7 – 100 | `CASE WHEN P_ppm IS NULL THEN NULL WHEN P_ppm < 4.7 OR P_ppm > 100 THEN 1 ELSE 0 END` |
   | `K_ppm` | 21,2 – 400 | `CASE WHEN K_ppm IS NULL THEN NULL WHEN K_ppm < 21.2 OR K_ppm > 400 THEN 1 ELSE 0 END` |
   | `MO_porc` | > 0,75 | `CASE WHEN MO_porc IS NULL THEN NULL WHEN MO_porc < 0.75 THEN 1 ELSE 0 END` |
   | `Salinidad` | < 2000 µS/cm | `CASE WHEN Salinidad IS NULL THEN NULL WHEN Salinidad > 2000 THEN 1 ELSE 0 END` |

   Ca, Mg, S y micronutrientes no tienen rango definido todavía (SOILO no lo publica).

5. Repita el paso 2 para crear tres fuentes más:
   - **3_Aforos_Cabecera**: `Fecha` = Fecha; `Ubicacion` = Geo › Latitud, longitud;
     `Kg_Ha_FV` = Número/Promedio; `Oferta_Total_Kg`, `Forraje_Aprovechable_Kg`, `Capacidad_Kg_PV_Ref`,
     `Capacidad_Animales_Ref` = Número/**Suma**; `Dias_Pastoreo` = Número/Promedio; `Ultimo_Aforo` = Número.
   - **2_Arvenses**: `Cobertura_Porc` = Número/Promedio.
   - **4_Aforos_Detalle**: `Peso_g` y `Altura_cm` = Número/Promedio.

---

## 2. Crear el informe

**Crear › Informe** → agregue las 4 fuentes (*Agregar datos › Mis fuentes de datos*).
En **cada página**, arriba: un **Control de período** (sobre `Fecha`) y una **Lista desplegable** de `Potrero`.

### ⚠️ Regla para la oferta de forraje
En todo gráfico de **3_Aforos_Cabecera** que **sume** oferta o capacidad, agregue el filtro
**`Ultimo_Aforo` = 1** (*Filtro › Agregar filtro › Incluir · Ultimo_Aforo · Igual a · 1*).
Así cada potrero cuenta una sola vez (su aforo más reciente). Para ver la evolución en el tiempo, **sin** ese filtro.

### Página 1 – Resumen
| Gráfico | Fuente | Configuración |
|---|---|---|
| Cuadro de resultados "Puntos muestreados" | Puntos | Métrica: `ID_Punto` → *Recuento distinto* |
| "pH promedio" | Puntos | `pH` (Promedio) |
| "% lecturas de pH fuera de rango" | Puntos | `Fuera_pH` (Promedio) → formato **Porcentaje** |
| "Oferta total (kg FV)" | Aforos · filtro Ultimo_Aforo = 1 | `Oferta_Total_Kg` (Suma) |
| "Capacidad para 3 días (kg PV)" | Aforos · filtro Ultimo_Aforo = 1 | `Capacidad_Kg_PV_Ref` (Suma) |
| "Potreros aforados" | Aforos · filtro Ultimo_Aforo = 1 | `Potrero` → *Recuento distinto* |

### Página 2 – Suelos
| Gráfico | Configuración |
|---|---|
| **Mapa de burbujas** (Google Maps) | Ubicación: `Ubicacion` · Color: `Estado_pH` · Tooltip: `Potrero` |
| **Barras** pH por potrero | Dimensión `Potrero` · Métrica `pH` (Promedio) · *Línea de referencia* constante **5,5** |
| **Tabla** de nutrientes | Dimensión `Potrero` · Métricas `pH`, `N_ppm`, `P_ppm`, `K_ppm`, `MO_porc` (Promedio) · *Formato condicional*: rojo si fuera de rango |
| **Barras** "% fuera de rango por nutriente" | Métricas `Fuera_pH`, `Fuera_N`, `Fuera_P`, `Fuera_K`, `Fuera_MO` (Promedio, formato %) |

### Página 3 – Forraje y pastoreo
| Gráfico | Configuración |
|---|---|
| **Barras** kg FV/ha por potrero | Filtro Ultimo_Aforo = 1 · Dimensión `Potrero` · Métrica `Kg_Ha_FV` · orden descendente |
| **Barras** capacidad por potrero | Filtro Ultimo_Aforo = 1 · `Capacidad_Kg_PV_Ref` (o `Capacidad_Animales_Ref` si cargan peso promedio) |
| **Tabla** | Filtro Ultimo_Aforo = 1 · `Potrero`, `Fecha`, `Kg_Ha_FV`, `Oferta_Total_Kg`, `Capacidad_Kg_PV_Ref`, `Dias_Pastoreo`, `Estado_Potrero` |
| **Serie temporal** (tendencia) | **Sin** filtro · Dimensión `Fecha` · Métrica `Kg_Ha_FV` (Promedio) · Desglose `Potrero` |
| **Tabla de variabilidad** | Fuente 4_Aforos_Detalle · `Potrero`, `Peso_g` (Mín, Promedio, Máx), `ID_Detalle` (Recuento) |

> Capacidad y días se guardan con el consumo **conservador (15 % del peso vivo)** y 30 % de desperdicio.

### Página 4 – Arvenses
| Gráfico | Configuración |
|---|---|
| **Circular** | Fuente 2_Arvenses · Dimensión `Nombre_Arvense` · Métrica *Recuento de registros* |
| **Tabla** | `Nombre_Arvense`, `Nombre_Cientifico`, `Potrero`, `Cobertura_Porc` (Promedio), `Abundancia` |
| **Tabla** "qué indican" | `Potrero`, `Nombre_Arvense`, `Indicador_Suelo` (lo que indica según la lista de bioindicadoras de la finca) |
| **Tabla** arvenses en marcos de aforo | Fuente 4_Aforos_Detalle · `Potrero`, `Arvenses_Marco` (texto libre por marco) |

> El cruce automático arvenses ↔ análisis de suelo (✓ coincide / ✗ no coincide) está en el dashboard de la app,
> pestaña **Botánica**; en Looker se muestra el texto `Indicador_Suelo` para leerlo junto a la tabla de nutrientes.

---

## 3. Compartir con gerencia

1. **Compartir** (arriba a la derecha) → agregue los correos de gerencia como **Lector**.
2. En **Recurso › Gestionar las fuentes de datos añadidas › Editar** deje *Credenciales de datos* = **Propietario**:
   así gerencia ve el informe **sin necesitar acceso a la hoja**.

## 4. Envío automático: lunes, miércoles y viernes por la tarde

1. Botón **Compartir ▾ › Programar envío** (o *Programar envío por correo electrónico*).
2. **Destinatarios:** los correos de gerencia (y el suyo).
3. **Hora de inicio:** por ejemplo **5:00 p. m.** (hora de Colombia).
4. **Repetir:** *Personalizado* → cada **1 semana** → marque **lunes, miércoles y viernes**.
5. Páginas: todas (o solo Resumen y Forraje, si prefieren un correo más corto).
6. **Guardar.**

> Si su versión de Looker no permite marcar varios días en "Personalizado", avíseme y buscamos la alternativa.

El correo lleva el informe con los datos que haya en la hoja **en ese momento**: lo que el técnico sincronizó
hasta antes de la hora del envío.
