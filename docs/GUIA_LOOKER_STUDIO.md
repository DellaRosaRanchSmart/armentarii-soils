# Guía de Looker Studio

Fuente de datos: **Google Sheets › Sistema_Agronomia_Digital**. Agregue cada pestaña como una fuente aparte
(0 a 4). La app ya escribe los números como número y deja la hoja sin filas vacías.

## 1. Revisar tipos de campo (una vez por fuente)

*Recurso › Gestionar fuentes de datos › Editar*:

| Campo | Tipo | Agregación predeterminada |
|---|---|---|
| `pH`, `N_ppm` … `Zn_ppm`, `MO_porc`, `Salinidad`, `*_Porc` | Número | **Promedio** |
| `Kg_Ha_FV`, `Promedio_Peso_g`, `Peso_g` | Número | **Promedio** |
| `Oferta_Total_Kg`, `Area_Ha` | Número | Suma (ver advertencia abajo) |
| `Ubicacion`, `LatLong_Muestra` | **Geo › Latitud, longitud** | — |
| `Fecha` | Fecha | — |

> Ojo con el nombre: la columna es `MO_porc` (p minúscula), no `MO_Porc`.

## 2. Relacionar pestañas

`1_Puntos_Muestreo` y `3_Aforos_Cabecera` no traen la fecha; está en `0_Jornadas`. Dos opciones:
- **Fácil (recomendada):** cree la columna `Fecha` en esas pestañas (ver INSTALACION.md, columnas opcionales); la app la llena.
- **Combinar datos** (*Recurso › Combinaciones*): `1_Puntos_Muestreo` ⟷ `0_Jornadas` por `ID_Jornada`, unión *externa izquierda*.

Para arvenses por potrero: cree la columna `Potrero` en `2_Arvenses`, o combine con `1_Puntos_Muestreo` por `ID_Punto`.

## 3. ⚠️ Oferta total: no sumar todo el historial

Si suma `Oferta_Total_Kg` de toda la hoja, un potrero aforado 3 veces se cuenta 3 veces.
Para "cuánta comida hay hoy", **filtre por la última jornada** (control de *Período* o lista desplegable de `ID_Jornada`).
El dashboard de la app ya lo hace solo: usa el último aforo de cada potrero.

## 4. Campo calculado útil: rango de pH

En `1_Puntos_Muestreo` › *Agregar un campo*:

```
CASE
  WHEN pH IS NULL THEN "Sin análisis"
  WHEN pH < 5 THEN "1 Muy ácido (<5,0)"
  WHEN pH < 5.5 THEN "2 Ácido (5,0–5,5)"
  WHEN pH <= 7 THEN "3 Adecuado (5,5–7,0)"
  ELSE "4 Alcalino (>7,0)"
END
```
Úselo como *Color por* en el mapa. Los cortes son los mismos del dashboard de la app (la línea crítica 5,5 es la que usted indicó; ajústelos a su criterio agronómico).

## 5. Tablero propuesto

**Página 1 – Fertilidad** (`1_Puntos_Muestreo`)
- Mapa de burbujas: Ubicación = `Ubicacion`; Color = campo *Rango de pH*; Tamaño = `P_ppm` (Promedio).
- Scorecards: `pH`, `P_ppm`, `K_ppm`, `MO_porc` (Promedio) + recuento de `ID_Punto`.
- Barras: Dimensión `Potrero`, Métrica `pH` (Promedio), *Línea de referencia* constante 5,5.
- Dispersión: X = `MO_porc`, Y = `N_ppm`, Dimensión = `ID_Punto`.

**Página 2 – Forrajes** (`3_Aforos_Cabecera`, filtrada a la última jornada)
- Barras: Dimensión `Potrero`, Métrica `Kg_Ha_FV` (Promedio), ordenado descendente, línea de referencia en la meta.
- Medidor (Gauge): `Kg_Ha_FV` (Promedio), Máximo/objetivo = 15 000.
- Scorecard: `Oferta_Total_Kg` (Suma) – solo con el filtro de jornada.
- Variabilidad: con `4_Aforos_Detalle`, gráfico de *caja y bigotes* o tabla con Mín/Máx/Promedio de `Peso_g` por `ID_Aforo`.

**Página 3 – Botánica** (`2_Arvenses`)
- Circular: Dimensión `Nombre_Arvense`, Métrica *Recuento de registros* (frecuencia) o `Cobertura_Porc` (Promedio).
  `Abundancia` es una escala de texto (Escasa…Dominante): úsela como dimensión o filtro, no como métrica.
- Tabla: `Nombre_Arvense`, recuento, `Cobertura_Porc` promedio.

## Dashboard sin Looker

`dashboard.html` (botón **📊 Dashboard** de la app) ya trae estas tres páginas con filtros por jornada,
potrero y fechas, lee directamente de la hoja y guarda la última copia para verla sin señal.
