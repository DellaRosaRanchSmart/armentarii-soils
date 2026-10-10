# Históricos SOILO

Transcripción de los 5 informes del sensor SOILO al formato de `0_Jornadas` y `1_Puntos_Muestreo`.
Se cargan desde la app: **Ajustes › Importar históricos (CSV)**, primero las jornadas y luego los puntos; después **⟳ Sincronizar**.
Volver a importar no duplica filas, porque el ID se arma con el número de informe.

| Informe | Fecha / hora | Código | Coordenada en el informe | Ubicación cargada |
|---|---|---|---|---|
| #12F8B3DB | 2026-08-29 11:58 | — | 8°39'23.30"N 75°53'43.41"W | 8.656472, -75.895392 (convertida de grados-minutos-segundos) |
| #1D208F3F | 2026-08-29 12:05 | — | 8.656006, 75.894677 | 8.656006, **-**75.894677 |
| #FABEE675 | 2026-08-29 12:07 | C412 | 8.655727, 75.894474 | 8.655727, **-**75.894474 |
| #C352285A | 2026-08-29 12:10 | C49B | 8.655342, 75.894753 | 8.655342, **-**75.894753 |
| #8CB97C23 | 2026-09-18 11:19 | Promedio C49B C410 C46 | — | sin ubicación (muestra compuesta) |

Criterios usados (revisar):
- **Longitud:** los informes la escriben sin signo. Colombia está al oeste, así que se cargó negativa. Sin el signo, el punto caería en la India.
- **Potrero:** se puso `C4` cuando el código empieza por C4. Es una suposición; los informes sin código quedan sin potrero.
- **Responsable:** se tomó del campo "Farmer Name", que puede ser el nombre de la cuenta del equipo y no el de quien muestreó.
- **Salinidad:** viene en µS/cm (800 en los 5 informes). **Humedad** = "Moisture" del sensor. La temperatura del suelo no tiene columna, así que quedó en Observaciones.
