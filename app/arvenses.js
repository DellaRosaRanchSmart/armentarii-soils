/* Arvenses bioindicadoras – lista entregada por la finca (oct. 2026).
   [n°, nombres comunes, nombre científico, lo que indica del suelo (texto original), etiquetas]
   Las etiquetas se derivaron SOLO del texto de "lo que indica"; sirven para cruzar con el análisis de suelo:
     acidez, acidez_extrema, aluminio, p_bajo, p_desequilibrio, p_alto, k_bajo, k_alto, ca_bajo, b_bajo,
     n_alto, n_bajo, mo_baja, mo_alta, compactacion, drenaje_malo, erosion, suelo_desnudo, sales,
     fertilidad_baja, suelo_fertil, subpastoreo
   Donde el documento original dice "[falta en el original]" el texto quedó incompleto y no se infirió nada. */
const ARVENSES = [
  [1, ['Escoba blanca', 'escoba', 'escobilla', 'escoba babosa', 'escoba negra', 'escobadura', 'escobo'], 'Sida acuta Burm. f. / Sida rhombifolia L.',
    'Compactación subsuperficial (capa dura entre 8 y 25 cm) por pisoteo. Suelos pobres en calcio, pH ácido a neutro', ['compactacion', 'ca_bajo']],
  [2, ['Coquito', 'juncia', 'coquillo', 'chivasa', 'cortadera', 'junco de coquito'], 'Cyperus rotundus L.',
    'Compactación severa, drenaje deficiente y poca aireación. Desequilibrio de fósforo y deficiencia de [falta en el original]. pH variable (4–8)', ['compactacion', 'drenaje_malo', 'p_desequilibrio']],
  [3, ['Cortadera', 'cabezonillo'], 'Cyperus ferax Rich.',
    'Mal drenaje y encharcamiento. Posible acumulación de sales en superficie. Típica de bajos y suelos pesados', ['drenaje_malo', 'sales']],
  [4, ['Maciega', 'marciega', 'paja cabezona', 'cabezona', 'gramalote', 'pajón', 'remolina'], 'Paspalum virgatum L.',
    'Suelos pesados con tendencia a saturarse. Acidez extrema (pH < 5), toxicidad de aluminio y poco fósforo disponible', ['drenaje_malo', 'acidez', 'acidez_extrema', 'aluminio', 'p_bajo']],
  [5, ['Dormidera', 'sensitiva', 'dormilona', 'vergonzosa', 'moriviví', 'adormidera'], 'Mimosa pudica L.',
    'Compactación por sobrepastoreo y erosión laminar. Deficiencia de calcio y fósforo; suelos ácidos y agotados', ['compactacion', 'erosion', 'ca_bajo', 'p_bajo', 'acidez', 'fertilidad_baja']],
  [6, ['Gusanillo', 'cola de zorro', 'rabo de zorra', 'rabo de gato', 'tusillo'], 'Setaria parviflora (antes S. geniculata)',
    'Suelo muy compactado. Poca materia orgánica activa, baja fertilidad y pérdida de estructura granular', ['compactacion', 'mo_baja', 'fertilidad_baja']],
  [7, ['Pasto argentina', 'bermuda', 'grama', 'grama dulce', 'pata de perdiz', 'tejedora'], 'Cynodon dactylon (L.) Pers.',
    'Capa dura superficial por pisoteo extremo (caminos, corrales, bebederos). Tolera baja fertilidad y pH entre 4 y 8', ['compactacion']],
  [8, ['Cadillo', 'cadillo carretón', 'carretón', 'abrojo', 'pegapega', 'cadillo tigre'], 'Cenchrus echinatus L.',
    'Compactación de todo el perfil. Suelo degradado, sin humus ni estructura', ['compactacion', 'mo_baja', 'fertilidad_baja']],
  [9, ['Bicho', 'matapasto', 'hediondilla', 'brusca cimarrona'], 'Senna obtusifolia (L.) Irwin & Barneby (la tabla original también menciona Cassia tora)',
    'Suelo descubierto, con estrés por sequía y pisoteo. Deficiencia de boro y calcio; acidez', ['suelo_desnudo', 'b_bajo', 'ca_bajo', 'acidez']],
  [10, ['Patetórtola', 'pata de tórtola', 'pata de paloma'], 'Croton trinitatis Millsp. / C. hirtus',
    'Suelo erosionado con costra superficial. Acidez alta y muy poco fósforo; típica de lomas y sabanas ácidas', ['erosion', 'acidez', 'p_bajo']],
  [11, ['Botoncillo'], 'Spermacoce verticillata L. (sin. Borreria verticillata)',
    'Suelo de estructura dura. Deficiencia de boro y alta saturación de [falta en el original]', ['compactacion', 'b_bajo']],
  [12, ['Verbena negra', 'verbena', 'verbenilla', 'rabo de zorro', 'rabo de alacrán', 'cola de armadillo', 'escobo macho'], 'Stachytarpheta cayennensis (Rich.) Vahl',
    'Compactación y poca agregación. Agotamiento de potasio y pérdida de materia orgánica por extracción sin reposición', ['compactacion', 'k_bajo', 'mo_baja']],
  [13, ['Pringamosa', 'ortiga'], 'Urtica dioica L. (ver nota 2)',
    'Mal drenaje y estructura colapsada. La materia orgánica se descompone sin oxígeno', ['drenaje_malo']],
  [14, ['Botoncillo blanco'], 'Galinsoga parviflora Cav.',
    'Suelos sueltos. Exceso de nitrógeno sin equilibrio con el cobre', ['n_alto']],
  [15, ['Lengua de vaca'], 'Rumex acetosella L. / R. obtusifolius L.',
    'Pisoteo en sesteaderos. Exceso de nitrógeno por acumulación de estiércol y orina; poca aireación', ['compactacion', 'n_alto']],
  [16, ['Liendre de puerco', 'liendra de puerco', 'paja de pato', 'arrocillo', 'paja de arroz', 'pasto colorado', 'grama salada'], 'Echinochloa colona (L.) Link (antes E. colonum)',
    'Encharcamiento prolongado. Suelos arcillosos con mal drenaje interno', ['drenaje_malo']],
  [17, ['Caminadora', 'pelabolsillo', 'pasto cola de lagarto'], 'Rottboellia cochinchinensis (antes R. exaltata)',
    'Suelos fértiles, con nitrógeno alto, alterados por labranza o sobrepastoreo', ['n_alto', 'suelo_fertil']],
  [18, ['Rabo de burro', 'puntero'], 'Anatherum bicorne (antes Andropogon bicornis)',
    'Suelos arenosos, secos y lavados. Muy pobres en fósforo y [falta en el original]. Indica degradación avanzada o abandono del potrero', ['p_bajo', 'fertilidad_baja']],
  [19, ['Abrojo', 'cachito de cabro', 'cizaña', 'espuela de caballo', 'guajirilla', 'pecado mortal'], 'Acanthospermum hispidum DC.',
    'Pisoteo alto y deficiencia severa de calcio. Según el documento de la finca, desaparece después de encalar', ['compactacion', 'ca_bajo']],
  [20, ['Lechero', 'yerba lechera', 'golondrina', 'gota de sangre', 'clavo de cristo', 'viernes santo'], 'Euphorbia heterophylla L.',
    'Suelo removido o expuesto. Nitrógeno alto por mineralización rápida; buena materia orgánica pero suelo alterado', ['n_alto', 'mo_alta']],
  [21, ['Siempreviva', 'suelda con suelda', 'sanalotodo'], 'Commelina diffusa Burm. f.',
    'Humedad constante y drenaje lento. Tolera acidez; materia orgánica húmeda alta', ['drenaje_malo', 'mo_alta']],
  [22, ['Pata de gallina', 'pategallina', 'pata de gallo', 'horquetilla', 'grama de horqueta', 'paja de burro'], 'Eleusine indica (L.) Gaertn.',
    'Compactación extrema en senderos de ganado. Acidez media y baja disponibilidad de [falta en el original]', ['compactacion', 'acidez']],
  [23, ['Bledo', 'bleo', 'ataco', 'bledo blanco', 'bleo de puerco', 'calalú'], 'Amaranthus dubius Mart. / Amaranthus spp.',
    'Suelos fértiles, con fósforo y potasio altos, pero con alteración física', ['suelo_fertil', 'p_alto', 'k_alto']],
  [24, ['Verdolaga'], 'Portulaca oleracea L.',
    'Costra o sellado superficial. Suelos fértiles y ricos en materia orgánica, pero compactados', ['erosion', 'suelo_fertil', 'mo_alta', 'compactacion']],
  [25, ['Paja mona'], 'Leptochloa filiformis (Lam.) Beauv.',
    'Suelos húmedos, francos a pesados. Pérdida estacional de nitratos por escorrentía', ['drenaje_malo']],
  [26, ['Cascabelito', 'crotalaria'], 'Crotalaria juncea L.',
    'Suelos secos, sueltos o en erosión. Muy poco nitrógeno; la planta fija nitrógeno atmosférico', ['erosion', 'n_bajo']],
  [27, ['Guarumo', 'yarumo', 'yagrumo', 'yarumo blanco'], 'Cecropia peltata L. (el documento de la finca dice C. teleincaica, que es andina)',
    'Zona sin pisoteo, donde empieza la sucesión secundaria en potreros subutilizados o abandonados. Acidez alta', ['subpastoreo', 'acidez']],
  [28, ['Guayabo agrio', 'guayabal'], 'Psidium guajava L.',
    'Baja presión de pastoreo; el ganado dispersa las semillas. Suelos ácidos a neutros y de baja fertilidad', ['subpastoreo', 'fertilidad_baja']],
  [29, ['Diente de león'], 'Taraxacum officinale Weber',
    'Materia orgánica sin incorporar y poca actividad microbiana. Calcio débil', ['ca_bajo']],
  [30, ['Cerraja'], 'Sonchus oleraceus L.',
    'Suelos bien estructurados o en descanso. Buen nitrógeno; indica condiciones aceptables', ['suelo_fertil']],
];

const normArv = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*\s]+/g, ' ').trim();
/** Busca una arvense por cualquiera de sus nombres comunes o por el científico. */
function buscarArvense(nombre) {
  const n = normArv(nombre);
  if (!n) return null;
  return ARVENSES.find(a => a[1].some(x => normArv(x) === n) || normArv(a[2]).startsWith(n)) || null;
}
/** Nombres comunes repetidos en varias especies (p. ej. "cortadera", "abrojo", "rabo de zorro"): avisar. */
const NOMBRES_AMBIGUOS = (() => {
  const c = {};
  ARVENSES.forEach(a => a[1].forEach(x => { const k = normArv(x); (c[k] = c[k] || []).push(a[0]); }));
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v.length > 1));
})();
