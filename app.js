const APP_VERSION = "20260903-radiology-finding1";
const CSV_PATH = `../database/current/Labordatenbank_aktuell_Messwerte.csv?v=${APP_VERSION}`;
const DOCUMENT_INDEX_PATH = `../database/current/Dokumentenindex.json?v=${APP_VERSION}`;
const REPORT_SEARCH_INDEX_PATH = `../database/current/Laborbericht-Suchindex.json?v=${APP_VERSION}`;
const ENCRYPTED_DATA_PATH = "./secure-data/lab-data.enc";
const ENCRYPTED_DOCUMENT_INDEX_PATH = "./secure-data/document-index.enc";
const ENCRYPTED_REPORT_SEARCH_INDEX_PATH = "./secure-data/report-search-index.enc";
const PASSWORD_STORAGE_KEY = "labResultsUnlockPassword";
const BIO_AGE_STORAGE_KEY = "labResultsBioAgeInputs";
const BIO_AGE_BIRTHDATE_KEY = "labResultsBioAgeBirthDate";
const BIO_AGE_MODEL_STORAGE_KEY = "labResultsBioAgeModel";
const DEFAULT_BIO_AGE_BIRTHDATE = "1992-05-21";

const ALL_VALUES_ORIGINAL_COLUMNS = [
  "Datum",
  "Labor",
  "Dokumentkategorie",
  "Abschnitt",
  "Kategorie",
  "Name_im_Bericht",
  "Standardname",
  "Ergebnis",
  "Ergebnis_text",
  "Qualifikator",
  "Einheit",
  "Referenzbereich",
  "Referenz_min",
  "Referenz_max",
  "Bewertung",
  "Methode",
  "Kommentar",
  "Quelldatei",
  "Seite",
];

const ALL_VALUES_GENERATED_COLUMNS = [
  "Verlaufsgruppe",
  "Suchaliase",
  "Messungen_in_Gruppe",
  "Dokumentlink",
];

const ALL_VALUES_EXPORT_COLUMNS = [...ALL_VALUES_ORIGINAL_COLUMNS, ...ALL_VALUES_GENERATED_COLUMNS];

const state = {
  rows: [],
  groups: [],
  documents: [],
  reportSearchIndex: new Map(),
  reportSearchQuery: "",
  selectedKey: null,
  selectedKeys: [],
  hasUserSelection: false,
  compareMode: false,
  chartRows: [],
  chartPoints: [],
  hoveredPointId: null,
  selectedRowId: null,
  dateMin: null,
  dateMax: null,
  dateStart: null,
  dateEnd: null,
  chartCollapsed: false,
  tableCollapsed: false,
  tableSort: { key: "date", direction: "desc" },
  activeLabSheet: "labor",
  allValuesQuery: "",
  allValuesSort: "dateDesc",
  allValuesVisibleLimit: 300,
  chartZoom: null,
  activeView: "home",
  activeTopic: "haematologie",
  topicFocusSorts: {},
  searchSuggestIndex: -1,
  activeBioAgeModel: localStorage.getItem(BIO_AGE_MODEL_STORAGE_KEY) || "phenoage",
  bioAgeAutoValues: {},
  bioAgeManualValues: {},
};

const SERIES_COLORS = ["#174c3c", "#ef775c", "#d9b15f", "#4c9b77", "#006d77", "#7b6d9c", "#b43b46", "#69736d"];
const EXACT_SHORT_SEARCH_TERMS = new Set(["che"]);

const TOPIC_FOCUS_SORT_LABELS = {
  priority: "Priorität",
  dateDesc: "Neu zuerst",
  dateAsc: "Alt zuerst",
  nameAsc: "A bis Z",
  nameDesc: "Z bis A",
};

const TOPIC_CONFIGS = {
  haematologie: {
    label: "Themenansicht",
    title: "Blutbild",
    subtitle: "Kleines und großes Blutbild, Erythrozytenparameter, Thrombozyten und Differentialblutbild als Basisverlauf.",
    filter: isHematologyRow,
  },
  organe: {
    label: "Themenansicht",
    title: "Organe",
    subtitle: "Leber/Galle, Niere/Elektrolyte, Pankreas/Verdauung sowie Herz- und Muskelmarker als Organ-Funktionsblick.",
    filter: isOrganRow,
  },
  stoffwechsel: {
    label: "Themenansicht",
    title: "Stoffwechsel",
    subtitle: "Vitamine, Mikronährstoffe, Eisenstatus, Lipide, Glukose- und organische Säuren als Versorgungs- und Stoffwechselblick.",
    filter: isMetabolismRow,
  },
  immunologie: {
    label: "Themenansicht",
    title: "Immunologie",
    subtitle: "Zellulärer Immunstatus, Zytokine, Immunglobuline, Komplement und Immunfunktion ohne die separaten Auto-Antikörper.",
    filter: isImmunologyRow,
  },
  autoantikoerper: {
    label: "Themenansicht",
    title: "Auto-Antikörper",
    subtitle: "Fokus auf GPCR-/Rezeptor-Autoantikörper, klassische Autoimmunmarker und auffällige Antikörper-Konstellationen.",
    filter: isAutoAntibodyRow,
  },
  mikrobiom: {
    label: "Themenansicht",
    title: "Mikrobiom",
    subtitle: "Stuhlmarker, Leitkeime, Barriere, Entzündung und Erreger als kompakter Verlaufsüberblick.",
    filter: isMicrobiomeRow,
  },
};

const MODULE_CONFIGS = {
  befunde: {
    label: "Befunde",
    title: "Befunde",
    subtitle: "Qualitative Befunde, Arztbriefe und strukturierte Einschätzungen außerhalb der Messwerttabellen.",
    documentType: "finding",
    emptyStatus: "Noch keine Dokumente",
    placeholderTitle: "Noch keine Befunde hinterlegt.",
    placeholderText: "Sobald qualitative Befunde eingepflegt sind, erscheinen sie hier nach Fachgebiet gruppiert.",
  },
  allergien: {
    label: "Tests",
    title: "Allergie- und Unverträglichkeitstests",
    subtitle: "Eigener Überblick für Allergie-, IgE-, IgG-, Histamin- und Unverträglichkeitsbefunde.",
    documentType: "allergy",
    emptyStatus: "Noch keine Dokumente",
    placeholderTitle: "Noch keine Tests hinterlegt.",
    placeholderText: "Sobald Allergie- oder Unverträglichkeitstests eingepflegt sind, erscheinen sie hier als eigene Liste.",
  },
};

const PHENO_AGE_MARKERS = [
  {
    key: "albumin",
    label: "Albumin",
    unit: "g/L",
    median: 42,
    match: (row) => row._key === "albumin absolut",
    convert: (row) => convertBioAgeUnit(row, { "g/l": 1, "g/dl": 10, "mg/dl": 0.01, "mg/l": 0.001 }),
  },
  {
    key: "creatinine",
    label: "Kreatinin",
    unit: "µmol/L",
    median: 75,
    match: (row) => row._key === "kreatinin serum",
    convert: (row) => convertBioAgeUnit(row, { "µmol/l": 1, "mg/dl": 88.4, "mg/l": 8.84 }),
  },
  {
    key: "glucose",
    label: "Glukose",
    unit: "mmol/L",
    median: 5.1,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht} ${row.Abschnitt}`);
      return /\b(glucose|glukose|blutzucker)\b/.test(text) && !/\bu\s*glucose\b|\bu\s*glukose\b|\burin\b|hba1c/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "mmol/l": 1, "mg/dl": 1 / 18.0182 }),
  },
  {
    key: "crp",
    label: "CRP",
    unit: "mg/L",
    median: 1.5,
    match: (row) => row._key === "crp",
    convert: (row) => convertBioAgeUnit(row, { "mg/l": 1, "mg/dl": 10 }),
  },
  {
    key: "lymphocyte",
    label: "Lymphozyten",
    unit: "%",
    median: 30,
    match: (row) => row._key === "lymphozyten relativ",
    convert: (row) => convertBioAgeUnit(row, { "%": 1 }),
  },
  {
    key: "mcv",
    label: "MCV",
    unit: "fL",
    median: 90,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\bmcv\b|mittl\s+zell\s+volumen|mean\s+cell\s+volume/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { fl: 1 }),
  },
  {
    key: "rdw",
    label: "RDW",
    unit: "%",
    median: 13,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\brdw\b|ery\s+groessenvariabilitat|erythrozyten\s+volumenverteil|ery\s+volumenverteil/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "%": 1 }),
  },
  {
    key: "alp",
    label: "Alkalische Phosphatase",
    unit: "U/L",
    median: 70,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\balkalische\s+phosphatase\b|\balk\s+phosphatase\b|\balkal\s+p\s*ase\b|\balk\s+p\s*ase\b|\bap\b/.test(text)
        && !/vitamin|pyridoxal|phosphat\b/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "U/l": 1 }),
  },
  {
    key: "wbc",
    label: "Leukozyten",
    unit: "10^9/L",
    median: 6.5,
    match: (row) => row._key === "leukozyten",
    convert: (row) => convertBioAgeUnit(row, { "G/l": 1, "/nl": 1, "/µl": 0.001 }),
  },
];

const BIO_AGE_COEFFICIENTS = {
  albumin: -0.0336,
  creatinine: 0.0095,
  glucose: 0.1953,
  logCRP: 0.0954,
  lymphocyte: -0.012,
  mcv: 0.0268,
  rdw: 0.3306,
  alp: 0.00188,
  wbc: 0.0554,
  age: 0.0804,
  intercept: -19.907,
};

const BIO_AGE_MARKER_INFO = {
  albumin: "Albumin spiegelt Proteinstatus, Leberleistung und Entzündungsbelastung. Gut ist ein stabiler Normalbereich; im Alterstest ist tendenziell höher günstiger. Ideal/Anker: {ideal}.",
  creatinine: "Kreatinin dient als Nieren- und Muskelkontextmarker. Gut ist normal mit stabiler eGFR; im Alterstest ist tendenziell niedriger günstiger, aber zu niedrig kann wenig Muskelmasse bedeuten. Ideal/Anker: {ideal}.",
  glucose: "Glukose zeigt akute Stoffwechsel- und Insulinregulation. Gut ist nüchtern niedrig-normal; tendenziell niedriger ist günstiger, solange keine Unterzuckerung vorliegt. Ideal/Anker: {ideal}.",
  crp: "CRP misst systemische Entzündung. Gut ist niedrig und stabil; tendenziell niedriger ist günstiger. Ideal/Anker: {ideal}.",
  hsCrp: "hsCRP/CRP zeigt stille Entzündungsaktivität. Gut ist sehr niedrig und stabil; tendenziell niedriger ist günstiger. Ideal/Anker: {ideal}.",
  lymphocyte: "Lymphozyten stehen für adaptive Immunreserve. Gut ist ein stabiler Normalbereich; im Alterstest ist tendenziell höher günstiger, aber nur innerhalb plausibler Grenzen. Ideal/Anker: {ideal}.",
  mcv: "MCV beschreibt die Größe der roten Blutkörperchen. Gut ist mittig im Normalbereich; tendenziell niedriger Richtung Anker ist günstiger, deutlich hohe Werte können Mangel- oder Leberthemen anzeigen. Ideal/Anker: {ideal}.",
  rdw: "RDW misst die Größenstreuung roter Blutkörperchen. Gut ist geringe Streuung; tendenziell niedriger ist günstiger. Ideal/Anker: {ideal}.",
  alp: "Alkalische Phosphatase hängt mit Leber/Galle und Knochenumsatz zusammen. Gut ist ein ruhiger Normalbereich; tendenziell niedriger Richtung Anker ist günstiger, zu niedrig ist aber nicht automatisch besser. Ideal/Anker: {ideal}.",
  wbc: "Leukozyten zeigen allgemeine Immunaktivität. Gut ist ein stabiler Normalbereich; tendenziell niedriger als Entzündungssignal ist günstiger, solange keine Leukopenie besteht. Ideal/Anker: {ideal}.",
  urea: "Harnstoff spiegelt Eiweißumsatz, Hydration und Nierenkontext. Gut ist ein stabiler Normalbereich; im Bortz-Modell wirkt eher höher Richtung Anker günstiger, extreme Werte sind nicht erwünscht. Ideal/Anker: {ideal}.",
  cholesterol: "Gesamtcholesterin ist ein Stoffwechsel- und Membranlipidmarker. Für diesen Alterstest ist die Modellnähe wichtiger als die kardiologische Einzelbewertung; tendenziell höher Richtung Anker wirkt günstiger. Ideal/Anker: {ideal}.",
  cystatinC: "Cystatin C ist ein sensibler Nierenfiltrationsmarker. Gut ist niedrig-normal; tendenziell niedriger ist günstiger. Ideal/Anker: {ideal}.",
  hba1c: "HbA1c zeigt die längerfristige Zuckerbelastung und Glykation. Gut ist niedrig-normal; tendenziell niedriger ist günstiger, solange keine Hypoglykämien dahinterstehen. Ideal/Anker: {ideal}.",
  ggt: "GGT reagiert auf Leberstress, Gallestau und oxidativen Stress. Gut ist niedrig-normal; tendenziell niedriger ist günstiger. Ideal/Anker: {ideal}.",
  rbc: "Erythrozyten sichern Sauerstofftransport und Knochenmarkleistung. Gut ist ein stabiler Normalbereich; im Modell ist tendenziell höher günstiger, zu hoch kann aber ungünstig sein. Ideal/Anker: {ideal}.",
  monocytesAbs: "Monozyten absolut spiegeln angeborene Immunaktivität. Gut ist niedrig bis mittig im Normalbereich; tendenziell niedriger ist günstiger. Ideal/Anker: {ideal}.",
  neutrophilsAbs: "Neutrophile absolut steigen oft bei Entzündung oder Stress. Gut ist ein ruhiger Normalbereich; tendenziell niedriger Richtung Anker ist günstiger. Ideal/Anker: {ideal}.",
  alt: "ALT/GPT ist ein Leberzell- und Stoffwechselmarker. Gut ist im Normalbereich; im Bortz-Modell wirkt eher höher Richtung Anker günstiger, medizinisch sollten Erhöhungen trotzdem abgeklärt werden. Ideal/Anker: {ideal}.",
  shbg: "SHBG verbindet Hormonstatus, Leber und Insulinsensitivität. Gut ist kontextabhängig im Normalbereich; im Bortz-Modell wirkt tendenziell niedriger Richtung Anker günstiger. Ideal/Anker: {ideal}.",
  vitaminD: "25-OH-Vitamin D steht für Vitamin-D-Status und Immun-/Knochenkontext. Gut ist ein ausreichender Normalbereich; im Bortz-Modell wirkt tendenziell höher günstiger. Ideal/Anker im Modell: {ideal}.",
  mch: "MCH beschreibt die Hämoglobinmenge pro rotem Blutkörperchen. Gut ist mittig im Normalbereich; tendenziell niedriger Richtung Anker wirkt im Modell günstiger. Ideal/Anker: {ideal}.",
  apoA1: "ApoA1 ist der Hauptproteinanteil von HDL und steht für Lipidtransport. Gut ist meist höher im gesunden Kontext; im Bortz-Modell ist tendenziell höher günstiger. Ideal/Anker: {ideal}.",
};

const BORTZ_AGE_MARKERS = [
  {
    key: "albumin",
    bortzId: "S-albumin",
    label: "Albumin",
    unit: "g/L",
    coefficient: -0.011331946,
    mean: 45.1238763,
    match: (row) => row._key === "albumin absolut",
    convert: (row) => convertBioAgeUnit(row, { "g/l": 1, "g/dl": 10, "mg/dl": 0.01, "mg/l": 0.001 }),
  },
  {
    key: "alp",
    bortzId: "S-ALP",
    label: "Alkalische Phosphatase",
    unit: "IU/L",
    coefficient: 0.00164946,
    mean: 82.6847975,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\balkalische\s+phosphatase\b|\balk\s+phosphatase\b|\balkal\s+p\s*ase\b|\balk\s+p\s*ase\b|\bap\b/.test(text)
        && !/vitamin|pyridoxal|phosphat\b/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "U/l": 1, "µkat/l": 60, "nkat/l": 0.06 }),
  },
  {
    key: "urea",
    bortzId: "S-urea",
    label: "Harnstoff",
    unit: "mmol/L",
    coefficient: -0.029554872,
    mean: 5.3547152,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht} ${row.Abschnitt}`);
      return /\bharnstoff\b|\burea\b/.test(text) && !/\burin\b|\bu-/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "mmol/l": 1, "mg/dl": 0.1665 }),
  },
  {
    key: "cholesterol",
    bortzId: "S-cholesterol",
    label: "Gesamtcholesterin",
    unit: "mmol/L",
    coefficient: -0.0805656,
    mean: 5.6177437,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\b(gesamtcholesterin|cholesterin|cholesterol)\b/.test(text) && !/\bhdl\b|\bldl\b|non\s*hdl/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "mmol/l": 1, "mg/dl": 0.02586 }),
  },
  {
    key: "creatinine",
    bortzId: "S-creatinine",
    label: "Kreatinin",
    unit: "µmol/L",
    required: true,
    coefficient: -0.01095746,
    mean: 71.565605,
    match: (row) => row._key === "kreatinin serum",
    convert: (row) => convertBioAgeUnit(row, { "µmol/l": 1, "mg/dl": 88.4, "mg/l": 8.84 }),
  },
  {
    key: "cystatinC",
    bortzId: "S-cystatin-C",
    label: "Cystatin C",
    unit: "mg/L",
    required: true,
    coefficient: 1.859556436,
    mean: 0.900946,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /cystatin\s*c/.test(text) && !/\bgfr\b|egfr/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "mg/l": 1, "mg/dl": 10 }),
  },
  {
    key: "hba1c",
    bortzId: "B-HbA1c",
    label: "HbA1c",
    unit: "mmol/mol",
    coefficient: 0.018116675,
    mean: 35.4785711,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /hba1c/.test(text);
    },
    convert: convertHbA1cForBortz,
  },
  {
    key: "hsCrp",
    bortzId: "S-hsCRP",
    label: "hsCRP / CRP",
    unit: "mg/L",
    coefficient: 0.079109916,
    mean: 0.3003624,
    log: true,
    match: (row) => row._key === "crp",
    convert: (row) => convertBioAgeUnit(row, { "mg/l": 1, "mg/dl": 10 }),
  },
  {
    key: "ggt",
    bortzId: "S-GGT",
    label: "GGT",
    unit: "IU/L",
    required: true,
    coefficient: 0.265550311,
    mean: 3.3795613,
    log: true,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\bggt\b|gamma\s*-?\s*gt|gammagt/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "U/l": 1, "µkat/l": 60, "nkat/l": 0.06 }),
  },
  {
    key: "rbc",
    bortzId: "RBC",
    label: "Erythrozyten",
    unit: "10^12/L",
    coefficient: -0.204442153,
    mean: 4.4994648,
    match: (row) => row._key === "erythrozyten",
    convert: (row) => convertBioAgeUnit(row, { "T/l": 1, "Mio./µl": 1 }),
  },
  {
    key: "mcv",
    bortzId: "MCV",
    label: "MCV",
    unit: "fL",
    coefficient: 0.017165356,
    mean: 91.9251099,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\bmcv\b|mittl\s+zell\s+volumen|mean\s+cell\s+volume/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { fl: 1 }),
  },
  {
    key: "rdw",
    bortzId: "RDW",
    label: "RDW",
    unit: "%",
    required: true,
    coefficient: 0.202009895,
    mean: 13.4342296,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\brdw\b|evb\b|ery\s+groessenvariabilitat|erythrozyten\s+volumenverteil|ery\s+volumenverteil/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "%": 1 }),
  },
  {
    key: "monocytesAbs",
    bortzId: "MONOabs",
    label: "Monozyten absolut",
    unit: "10^9/L",
    coefficient: 0.36937314,
    mean: 0.4746987,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /monozyten|monocytes?|mono/.test(text) && /(absolut|\babs\b|zahl\s+abs)/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "G/l": 1, "/nl": 1, "/µl": 0.001 }),
  },
  {
    key: "neutrophilsAbs",
    bortzId: "NEUabs",
    label: "Neutrophile absolut",
    unit: "10^9/L",
    coefficient: 0.06679092,
    mean: 4.1849454,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /neutrophil|neutro/.test(text) && /(absolut|\babs\b|zahl\s+abs)/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "G/l": 1, "/nl": 1, "/µl": 0.001 }),
  },
  {
    key: "lymphocyte",
    bortzId: "LYM",
    label: "Lymphozyten",
    unit: "%",
    coefficient: -0.0108158,
    mean: 28.5817604,
    match: (row) => row._key === "lymphozyten relativ",
    convert: (row) => convertBioAgeUnit(row, { "%": 1 }),
  },
  {
    key: "alt",
    bortzId: "S-ALT",
    label: "ALT / GPT",
    unit: "IU/L",
    required: true,
    coefficient: -0.312442261,
    mean: 3.077868,
    log: true,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\balt\b|\bgpt\b|\balat\b/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "U/l": 1, "µkat/l": 60, "nkat/l": 0.06 }),
  },
  {
    key: "shbg",
    bortzId: "S-SHBG",
    label: "SHBG",
    unit: "nmol/L",
    coefficient: 0.292323186,
    mean: 3.8202787,
    log: true,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\bshbg\b/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "nmol/l": 1, "µg/dl": 0.10523 }),
  },
  {
    key: "vitaminD",
    bortzId: "S-25-OH-D",
    label: "25-OH-Vitamin D",
    unit: "nmol/L",
    required: true,
    coefficient: -0.265467867,
    mean: 3.6052878,
    log: true,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /(25\s*-?\s*oh|25\s*-?\s*hydroxy|calcidiol).*vitamin\s*d|vitamin\s*d.*(25\s*-?\s*oh|calcidiol)/.test(text)
        && !/1,?25|1\.25/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "nmol/l": 1, "ng/ml": 2.496, "µg/l": 2.496 }),
  },
  {
    key: "glucose",
    bortzId: "S-glucose",
    label: "Glukose",
    unit: "mmol/L",
    coefficient: 0.032171478,
    mean: 4.9563054,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht} ${row.Abschnitt}`);
      return /\b(glucose|glukose|blutzucker)\b/.test(text) && !/\bu\s*glucose\b|\bu\s*glukose\b|\burin\b|hba1c/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "mmol/l": 1, "mg/dl": 1 / 18.0182 }),
  },
  {
    key: "mch",
    bortzId: "MCH",
    label: "MCH",
    unit: "pg",
    coefficient: 0.02746487,
    mean: 31.8396206,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /\bmch\b|zell\s*haemoglobin|\bhbe\b|hb\/ery/.test(text) && !/mchc|konz/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { pg: 1 }),
  },
  {
    key: "apoA1",
    bortzId: "S-ApoA1",
    label: "ApoA1",
    unit: "g/L",
    coefficient: -0.185139395,
    mean: 1.5238771,
    match: (row) => {
      const text = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
      return /apoa1|apo\s*a\s*1|apolipoprotein\s*a/.test(text);
    },
    convert: (row) => convertBioAgeUnit(row, { "g/l": 1, "mg/dl": 0.01, "µmol/l": 0.028 }),
  },
];

const BIO_AGE_MODELS = {
  phenoage: {
    key: "phenoage",
    eyebrow: "PhenoAge",
    shortLabel: "PhenoAge",
    sourceLabel: "PhenoAge nach Levine et al.",
    subtitle: "Berechnung aus neun klinischen Markern plus chronologischem Alter, mit automatischer Wertauswahl aus der Labordatenbank.",
    markerNote: "PhenoAge-Marker",
    markers: PHENO_AGE_MARKERS,
    allowMedianFallback: true,
    formulaNote: "PhenoAge nach Levine et al.; Einheiten auf SI-Werte des Rechners normalisiert.",
    formulaLinks: [
      { label: "Levine et al. 2018", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5940111/" },
      { label: "Rieder-Rechner", url: "https://rieder-medevidence.com/longevity/biologisches-alter/" },
    ],
  },
  bortz: {
    key: "bortz",
    eyebrow: "Bortz Blood Age",
    shortLabel: "Bortz",
    sourceLabel: "Humanity's Bortz Blood Age",
    subtitle: "Berechnung nach dem Humanity/Bortz-Blood-Age-Modell mit bis zu 21 Blutmarkern; fehlende Marker werden sichtbar mit Durchschnittswerten ergänzt.",
    markerNote: "Bortz-Marker",
    markers: BORTZ_AGE_MARKERS,
    allowMedianFallback: false,
    allowAverageFallback: true,
    fillFallbackInputs: true,
    maxMissingOptional: 2,
    formulaNote: "Bortz Blood Age nach dem Humanity-Modell; Koeffizienten aus dem veröffentlichten Rechner, Einheiten normalisiert, fehlende Marker mit Modell-Durchschnitt ergänzt.",
    formulaLinks: [
      { label: "Bortz-Rechner", url: "https://www.longevity-tools.com/humanitys-bortz-blood-age" },
      { label: "Nature Paper", url: "https://www.nature.com/articles/s42003-023-05456-z" },
    ],
  },
};

const els = {
  viewTabs: [...document.querySelectorAll(".viewTab")],
  landingView: document.getElementById("landingView"),
  labSheetHero: document.getElementById("labSheetHero"),
  ageView: document.getElementById("ageView"),
  allValuesView: document.getElementById("allValuesView"),
  allValuesStats: document.getElementById("allValuesStats"),
  allValuesSearch: document.getElementById("allValuesSearch"),
  allValuesSort: document.getElementById("allValuesSort"),
  allValuesRows: document.getElementById("allValuesRows"),
  allValuesCount: document.getElementById("allValuesCount"),
  allValuesExportCsv: document.getElementById("allValuesExportCsv"),
  allValuesExportExcel: document.getElementById("allValuesExportExcel"),
  allValuesExportPdf: document.getElementById("allValuesExportPdf"),
  allValuesMore: document.getElementById("allValuesMore"),
  bioAgeEyebrow: document.getElementById("bioAgeEyebrow"),
  bioAgeSubtitle: document.getElementById("bioAgeSubtitle"),
  bioAgeModelButtons: [...document.querySelectorAll("[data-bio-age-model]")],
  bioAgeStats: document.getElementById("bioAgeStats"),
  bioAgeForm: document.getElementById("bioAgeForm"),
  bioBirthDate: document.getElementById("bioBirthDate"),
  bioChronAge: document.getElementById("bioChronAge"),
  bioAgeAutofill: document.getElementById("bioAgeAutofill"),
  bioAgeInputs: document.getElementById("bioAgeInputs"),
  bioAgeSave: document.getElementById("bioAgeSave"),
  bioAgeClear: document.getElementById("bioAgeClear"),
  bioAgeCompleteness: document.getElementById("bioAgeCompleteness"),
  bioAgeResult: document.getElementById("bioAgeResult"),
  bioAgeSourceCount: document.getElementById("bioAgeSourceCount"),
  bioAgeSources: document.getElementById("bioAgeSources"),
  labSheetButtons: [...document.querySelectorAll("[data-lab-sheet]")],
  explorerView: document.getElementById("explorerView"),
  topicView: document.getElementById("topicView"),
  reportsView: document.getElementById("reportsView"),
  moduleView: document.getElementById("moduleView"),
  moduleEyebrow: document.getElementById("moduleEyebrow"),
  moduleTitle: document.getElementById("moduleTitle"),
  moduleSubtitle: document.getElementById("moduleSubtitle"),
  moduleStats: document.getElementById("moduleStats"),
  moduleStatus: document.getElementById("moduleStatus"),
  modulePlaceholderTitle: document.getElementById("modulePlaceholderTitle"),
  modulePlaceholderText: document.getElementById("modulePlaceholderText"),
  moduleSummary: document.getElementById("moduleSummary"),
  moduleDocumentList: document.getElementById("moduleDocumentList"),
  landingValueCount: document.getElementById("landingValueCount"),
  landingReportCount: document.getElementById("landingReportCount"),
  reportStats: document.getElementById("reportStats"),
  reportCount: document.getElementById("reportCount"),
  reportSearchInput: document.getElementById("reportSearchInput"),
  reportSearchStatus: document.getElementById("reportSearchStatus"),
  reportList: document.getElementById("reportList"),
  topicEyebrow: document.getElementById("topicEyebrow"),
  topicTitle: document.getElementById("topicTitle"),
  topicSubtitle: document.getElementById("topicSubtitle"),
  topicStats: document.getElementById("topicStats"),
  topicFocusCount: document.getElementById("topicFocusCount"),
  topicFocusSortButton: document.getElementById("topicFocusSortButton"),
  topicFocusSortMenu: document.getElementById("topicFocusSortMenu"),
  topicFocusSortOptions: [...document.querySelectorAll("[data-topic-sort]")],
  topicFocusList: document.getElementById("topicFocusList"),
  topicGoodCount: document.getElementById("topicGoodCount"),
  topicGoodList: document.getElementById("topicGoodList"),
  topicCategoryCount: document.getElementById("topicCategoryCount"),
  topicCategoryList: document.getElementById("topicCategoryList"),
  topicTimelineCount: document.getElementById("topicTimelineCount"),
  topicTimeline: document.getElementById("topicTimeline"),
  topicTableCount: document.getElementById("topicTableCount"),
  topicRows: document.getElementById("topicRows"),
  topicHistoryModal: document.getElementById("topicHistoryModal"),
  topicHistoryTitle: document.getElementById("topicHistoryTitle"),
  topicHistorySubtitle: document.getElementById("topicHistorySubtitle"),
  topicHistoryCount: document.getElementById("topicHistoryCount"),
  topicHistoryExplore: document.getElementById("topicHistoryExplore"),
  topicHistorySummary: document.getElementById("topicHistorySummary"),
  topicHistoryChart: document.getElementById("topicHistoryChart"),
  topicHistoryRows: document.getElementById("topicHistoryRows"),
  topicHistoryClose: document.getElementById("topicHistoryClose"),
  datasetMeta: document.getElementById("datasetMeta"),
  recordCount: document.getElementById("recordCount"),
  sourceCount: document.getElementById("sourceCount"),
  searchInput: document.getElementById("searchInput"),
  searchSuggest: document.getElementById("searchSuggest"),
  categoryFilter: document.getElementById("categoryFilter"),
  labFilter: document.getElementById("labFilter"),
  statusFilter: document.getElementById("statusFilter"),
  dateStartInput: document.getElementById("dateStartInput"),
  dateEndInput: document.getElementById("dateEndInput"),
  dateRangeLabel: document.getElementById("dateRangeLabel"),
  datePopover: document.getElementById("datePopover"),
  dateFilterToggle: document.getElementById("dateFilterToggle"),
  dateApply: document.getElementById("dateApply"),
  dateReset: document.getElementById("dateReset"),
  matchList: document.getElementById("matchList"),
  matchCount: document.getElementById("matchCount"),
  compareMode: document.getElementById("compareMode"),
  selectedName: document.getElementById("selectedName"),
  selectedCount: document.getElementById("selectedCount"),
  selectedRange: document.getElementById("selectedRange"),
  latestValue: document.getElementById("latestValue"),
  chartSubtitle: document.getElementById("chartSubtitle"),
  chartPanel: document.querySelector(".chartPanel"),
  tablePanel: document.querySelector(".tablePanel"),
  chart: document.getElementById("historyChart"),
  chartTooltip: document.getElementById("chartTooltip"),
  chartLegend: document.getElementById("chartLegend"),
  chartZoomReset: document.getElementById("chartZoomReset"),
  chartToggle: document.getElementById("chartToggle"),
  tableToggle: document.getElementById("tableToggle"),
  sameUnitOnly: document.getElementById("sameUnitOnly"),
  rowCount: document.getElementById("rowCount"),
  historyRows: document.getElementById("historyRows"),
  sortButtons: [...document.querySelectorAll(".sortButton")],
  authGate: document.getElementById("authGate"),
  authForm: document.getElementById("authForm"),
  authPassword: document.getElementById("authPassword"),
  authRemember: document.getElementById("authRemember"),
  authMessage: document.getElementById("authMessage"),
};

function renderVersionLabels() {
  // APP_VERSION remains for cache-busting; it is intentionally not shown in the UI.
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derivePasswordKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function decryptPayload(payload, password) {
  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const key = await derivePasswordKey(password, salt, payload.iterations);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
}

async function fetchEncryptedPayload(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Verschlüsselte Daten konnten nicht geladen werden: ${response.status}`);
  return response.json();
}

function savedPassword() {
  return sessionStorage.getItem(PASSWORD_STORAGE_KEY) || localStorage.getItem(PASSWORD_STORAGE_KEY);
}

function rememberPassword(password, keepSignedIn) {
  sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
  if (keepSignedIn) localStorage.setItem(PASSWORD_STORAGE_KEY, password);
  else localStorage.removeItem(PASSWORD_STORAGE_KEY);
}

function forgetSavedPassword() {
  sessionStorage.removeItem(PASSWORD_STORAGE_KEY);
  localStorage.removeItem(PASSWORD_STORAGE_KEY);
}

async function unlockEncryptedCsv() {
  const payload = await fetchEncryptedPayload(ENCRYPTED_DATA_PATH);
  const password = savedPassword();
  if (password) {
    try {
      sessionStorage.setItem(PASSWORD_STORAGE_KEY, password);
      return await decryptPayload(payload, password);
    } catch {
      forgetSavedPassword();
    }
  }

  els.authGate.hidden = false;
  els.authPassword.focus();
  return new Promise((resolve) => {
    const onSubmit = async (event) => {
      event.preventDefault();
      const password = els.authPassword.value;
      const button = els.authForm.querySelector("button");
      els.authMessage.textContent = "";
      button.disabled = true;
      try {
        const csv = await decryptPayload(payload, password);
        rememberPassword(password, els.authRemember.checked);
        els.authPassword.value = "";
        els.authRemember.checked = false;
        els.authGate.hidden = true;
        els.authForm.removeEventListener("submit", onSubmit);
        resolve(csv);
      } catch {
        els.authMessage.textContent = "Kennwort stimmt nicht oder die Daten sind beschädigt.";
      } finally {
        button.disabled = false;
      }
    };
    els.authForm.addEventListener("submit", onSubmit);
  });
}

async function loadCsvText() {
  try {
    const response = await fetch(CSV_PATH);
    if (response.ok) return response.text();
  } catch {
    // Public GitHub Pages builds do not include the plaintext CSV.
  }
  return unlockEncryptedCsv();
}

async function loadDocumentIndex() {
  try {
    const response = await fetch(DOCUMENT_INDEX_PATH, { cache: "no-store" });
    if (response.ok) return normalizeDocumentIndex(await response.json());
  } catch {
    // Public GitHub Pages builds do not include the plaintext document index.
  }

  const password = savedPassword();
  if (!password) return [];
  try {
    const payload = await fetchEncryptedPayload(ENCRYPTED_DOCUMENT_INDEX_PATH);
    const text = await decryptPayload(payload, password);
    return normalizeDocumentIndex(JSON.parse(text));
  } catch {
    return [];
  }
}

async function loadReportSearchIndex() {
  let index = null;
  try {
    const response = await fetch(REPORT_SEARCH_INDEX_PATH, { cache: "no-store" });
    if (response.ok) index = await response.json();
  } catch {
    // Public GitHub Pages builds do not include the plaintext search index.
  }

  if (!index) {
    const password = savedPassword();
    if (!password) return new Map();
    try {
      const payload = await fetchEncryptedPayload(ENCRYPTED_REPORT_SEARCH_INDEX_PATH);
      index = JSON.parse(await decryptPayload(payload, password));
    } catch {
      return new Map();
    }
  }

  const reports = Array.isArray(index?.reports) ? index.reports : [];
  return new Map(reports
    .filter((report) => report?.file && Array.isArray(report.pages))
    .map((report) => [report.file, report]));
}

function normalizeDocumentIndex(index) {
  const documents = Array.isArray(index?.documents) ? index.documents : [];
  return documents.map((doc, index) => {
    const date = toDate(doc.date);
    return {
      ...doc,
      _id: doc.id || `document-${index}`,
      _date: date,
      _time: date?.getTime() || 0,
    };
  }).filter((doc) => doc.file && doc.collection && doc.type);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.some(Boolean));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[βß]/g, (m) => (m === "β" ? "beta" : "ss"))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return normalizeText(String(value || "")
    .replace(/bezogen\s+auf\s+(?:kreatinin|creatinin|creatinine)/gi, "bezogen")
    .replace(/\/\s*g\s+(?:kreatinin|creatinin|creatinine)/gi, "/g"));
}

function compactSearchText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function searchAliasesForGroup(rows, key, displayName) {
  const tokens = [key, displayName, ...rows.flatMap((row) => [row.Standardname, row.Name_im_Bericht])]
    .map(compactSearchText);
  if (tokens.some((token) => ["che", "cheaktivitat", "cholinesterase", "serumcholinesterase", "pseudocholinesterase", "butyrylcholinesterase"].includes(token))) {
    return ["CHE", "ChE", "Pseudocholinesterase", "Serumcholinesterase", "Butyrylcholinesterase", "Cholesterinase"];
  }
  if (tokens.some((token) => ["ft3", "ft3eclia", "ft3freiest3", "freiest3", "freiestrijodthyroninft3"].includes(token))) {
    return ["fT3", "FT3", "freies T3", "freies Trijodthyronin"];
  }
  if (tokens.some((token) => ["ft4", "ft4eclia", "ft4freiesthyroxin", "freiest4", "freiesthyroxinft4"].includes(token))) {
    return ["fT4", "FT4", "freies T4", "freies Thyroxin"];
  }
  if (key === "1,25-oh2-vitamin d") {
    return ["Calcitriol", "1,25-(OH)2-Vitamin D3", "aktives Vitamin D"];
  }
  if (key === "25-oh-vitamin d") {
    return ["Calcidiol", "25-Hydroxy-Vitamin D", "Vitamin D3"];
  }
  return [];
}

function aliasKey(row) {
  const source = normalizeText(`${row.Standardname} ${row.Name_im_Bericht}`);
  const primaryName = normalizeText(row.Standardname || row.Name_im_Bericht);
  const differentialKey = simpleDifferentialAlias(primaryName, row.Einheit);
  if (differentialKey) return differentialKey;
  if (/^cd4\s+cd8\s+(?:index|ratio)$/.test(primaryName)) return "cd4 cd8 ratio";
  if (/\bbilirubin\b/.test(source)) {
    if (/\bu\s*bilirubin\b|urin/.test(source)) return "bilirubin urin";
    if (/direkt|konjugiert/.test(source)) return "bilirubin direkt";
    if (/indirekt|unkonjugiert/.test(source)) return "bilirubin indirekt";
    return "bilirubin gesamt";
  }
  if (/\bgamma\s*gt\b|\bgamma\s*gtse\b|\bggt\b|\bg\s*gt\b/.test(source)) return "gamma-gt";
  if (/\balbumin\b|albuminfraktion/.test(source)) {
    const unit = canonicalUnit(row.Einheit);
    if (/\bu\s*albumin\b|urin/.test(source)) return "albumin urin";
    if (unit === "%" || /fraktion|relativ|rel\s*%|\(\s*%\s*\)/.test(source)) return "albumin prozent";
    if (/absolut/.test(source) || ["g/l", "g/dl", "mg/l", "mg/dl"].includes(unit.toLowerCase())) return "albumin absolut";
  }
  if (/cystatin/.test(source)) {
    if (/\begfr\b|\bgfr\b|filtration|filtrationsrate|clearance|ckd\s*epi/.test(source)) return "egfr cystatin c";
    return "cystatin c";
  }
  const hasCreatinine = /kreatinin|creatinin|creatinine/.test(source);
  const isCreatinineIndexed = /bezogen\s+auf\s+kreatinin|pro\s+kreatinin|\/\s*g\s*kreatinin|\/\s*mol\s*kreatinin/.test(source);
  const startsAsCreatinine = /^(u\s*)?(kreatinin|creatinin|creatinine)\b/.test(source);
  if (hasCreatinine && (!isCreatinineIndexed || startsAsCreatinine)) {
    if (/\begfr\b|\bgfr\b|filtration|filtrationsrate|clearance|glomerular/.test(source)) return "egfr kreatinin";
    if (/\burin\b|\bu\s*kreatinin\b|\bi\s*u\b|\bi\s*urin\b|ausscheidung/.test(source)) return "kreatinin urin";
    return "kreatinin serum";
  }
  const rules = [
    [/cystathionin/, "cystathionin"],
    [/vit(?:amin)?\s*b\s*6|pyridoxal|plp/, "vitamin b6 / plp"],
    [/vit(?:amin)?\s*b\s*12/, "vitamin b12"],
    [/1\s*25.*oh.*vitamin.*d|calcitriol/, "1,25-oh2-vitamin d"],
    [/25.*oh.*vitamin.*d|25.*hydroxy.*vitamin.*d|calcidiol/, "25-oh-vitamin d"],
    [/\bft3\b.*\bft4\b|\bft4\b.*\bft3\b|ft3\s*ft4\s*quotient|ft3\s*ft4\s*ratio/, "ft3 ft4 quotient"],
    [/\bft3\b|freies\s+t3|freies\s+trijodthyronin/, "ft3"],
    [/\bft4\b|freies\s+t4|freies\s+thyroxin/, "ft4"],
    [/\btsh\b|tsh basal|tshbasal/, "tsh"],
    [/\bcrp\b|crp sensitiv|crp ultrasensitiv|ultrasensitiv/, "crp"],
    [/calprotectin/, "calprotectin"],
    [/homocystein/, "homocystein"],
    [/helicobacter/, "helicobacter pylori"],
    [/pyrrole|pyrrolurie/, "pyrrole"],
    [/glutathion/, "glutathion"],
  ];
  if (/methylmalonsaure|methylmalonsaeure/.test(source)) {
    const unit = canonicalUnit(row.Einheit);
    const combined = `${source} ${normalizeText(row.Einheit)}`;
    if (
      unit === "mg/g Kreatinin" ||
      /bezogen\s+auf\s+kreatinin|pro\s+kreatinin|\/\s*g\s*(?:kreatinin|creatinin|creatinine|crea|krea|crt\.?)/.test(combined)
    ) {
      return "methylmalonsaeure kreatininbezogen";
    }
    if (/\burin\b|\bi\s*u\b|\bi\.u\b/.test(source)) return "methylmalonsaeure urin";
    return "methylmalonsaeure";
  }
  for (const [pattern, key] of rules) {
    if (pattern.test(source)) return key;
  }
  return normalizeText(row.Standardname || row.Name_im_Bericht);
}

function simpleDifferentialAlias(name, unit) {
  if (!name) return "";
  const canonical = canonicalUnit(unit);
  if (/^b\s+lymphozyten\s+gesamt(?:\s+cd19)?/.test(name)) {
    return canonical === "%" ? "b-lymphozyten gesamt relativ" : "b-lymphozyten gesamt absolut";
  }
  if (/^t\s+lymphozyten\s+gesamt(?:\s+cd3)?/.test(name)) {
    return canonical === "%" ? "t-lymphozyten gesamt relativ" : "t-lymphozyten gesamt absolut";
  }
  if (/\b(?:cd\d+|cd\d|cd19|cd3|cd4|cd8|nk|nkt)\b|\bb\s+lymphozyten\b|\bt\s+lymphozyten\b/.test(name)) return "";
  const rules = [
    ["lymphozyten", /^lymphozyten(?:zahl)?(?:\s|,|\(|$)/],
    ["monozyten", /^monozyten(?:zahl)?(?:\s|,|\(|$)/],
    ["eosinophile", /^eosinophile(?:\s|,|\(|$)/],
    ["basophile", /^basophile(?:\s|,|\(|$)/],
    ["neutrophile", /^neutrophile(?:\s|,|\(|$)/],
  ];
  const match = rules.find(([, pattern]) => pattern.test(name));
  if (!match) return "";
  const hasAbsolute = /\babs\.?\b|\babsolut\b|\bzahl\s*abs\b/.test(name);
  return `${match[0]} ${hasAbsolute ? "absolut" : "relativ"}`;
}

function displayNameForGroup(rows, key) {
  const aliasNames = {
    "vitamin b6 / plp": "Vitamin B6 / PLP",
    "cystathionin": "Cystathionin",
    "vitamin b12": "Vitamin B12",
    "methylmalonsaeure": "Methylmalonsäure",
    "methylmalonsaeure kreatininbezogen": "Methylmalonsäure / Kreatinin",
    "methylmalonsaeure urin": "Methylmalonsäure im Urin",
    "25-oh-vitamin d": "25-OH-Vitamin D",
    "1,25-oh2-vitamin d": "1,25-(OH)2-Vitamin D (Calcitriol)",
    "ft3": "FT3",
    "ft4": "FT4",
    "ft3 ft4 quotient": "FT3/FT4-Quotient",
    "tsh": "TSH",
    "crp": "CRP",
    "calprotectin": "Calprotectin",
    "homocystein": "Homocystein",
    "helicobacter pylori": "Helicobacter pylori",
    "pyrrole": "Pyrrole",
    "glutathion": "Glutathion",
    "bilirubin gesamt": "Bilirubin gesamt",
    "bilirubin direkt": "Bilirubin direkt",
    "bilirubin indirekt": "Bilirubin indirekt",
    "bilirubin urin": "U-Bilirubin",
    "gamma-gt": "Gamma-GT",
    "albumin prozent": "Albumin (%)",
    "albumin absolut": "Albumin absolut",
    "albumin urin": "U-Albumin",
    "cystatin c": "Cystatin C",
    "egfr cystatin c": "eGFR nach Cystatin C",
    "kreatinin serum": "Kreatinin",
    "kreatinin urin": "Kreatinin im Urin",
    "egfr kreatinin": "eGFR nach Kreatinin",
    "lymphozyten relativ": "Lymphozyten",
    "lymphozyten absolut": "Lymphozyten absolut",
    "monozyten relativ": "Monozyten",
    "monozyten absolut": "Monozyten absolut",
    "eosinophile relativ": "Eosinophile",
    "eosinophile absolut": "Eosinophile absolut",
    "basophile relativ": "Basophile",
    "basophile absolut": "Basophile absolut",
    "neutrophile relativ": "Neutrophile",
    "neutrophile absolut": "Neutrophile absolut",
    "b-lymphozyten gesamt relativ": "B-Lymphozyten gesamt",
    "b-lymphozyten gesamt absolut": "B-Lymphozyten gesamt (CD19) absolut",
    "t-lymphozyten gesamt relativ": "T-Lymphozyten gesamt",
    "t-lymphozyten gesamt absolut": "T-Lymphozyten gesamt (CD3) absolut",
    "cd4 cd8 ratio": "CD4/CD8 Ratio",
  };
  if (aliasNames[key]) return aliasNames[key];
  const counts = new Map();
  for (const row of rows) {
    const name = row.Standardname || row.Name_im_Bericht || key;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de"))[0]?.[0] || key;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function canonicalUnit(unit) {
  const compact = String(unit || "")
    .trim()
    .replace(/μ/g, "µ")
    .replace(/\s+/g, "")
    .replace(/\/I$/i, "/l");
  const lower = compact.toLowerCase();
  if (compact === "G/l" || compact === "G/L") return "G/l";
  if (compact === "T/l" || compact === "T/L") return "T/l";
  const map = {
    "mg/dl": "mg/dl",
    "mg/l": "mg/l",
    "mg/kg": "µg/g",
    "g/dl": "g/dl",
    "g/l": "g/l",
    "µg/dl": "µg/dl",
    "µg/l": "µg/l",
    "µg/ml": "µg/ml",
    "µg/g": "µg/g",
    "ug/g": "µg/g",
    "ng/ml": "ng/ml",
    "ng/dl": "ng/dl",
    "ng/l": "ng/l",
    "pg/ml": "pg/ml",
    "pg/ery": "pg",
    "pg": "pg",
    "mmol/l": "mmol/l",
    "mmol/mol": "mmol/mol",
    "mmol/molhb": "mmol/mol",
    "µmol/l": "µmol/l",
    "umol/l": "µmol/l",
    "nmol/l": "nmol/l",
    "pmol/l": "pmol/l",
    "miu/l": "mIU/l",
    "µu/ml": "mIU/l",
    "µiu/ml": "mIU/l",
    "mu/l": "mIU/l",
    "mµ/l": "mIU/l",
    "ratio": "Ratio",
    "index": "Ratio",
    "s": "s",
    "sec": "s",
    "sec.": "s",
    "u/l": "U/l",
    "ie/l": "U/l",
    "iu/l": "U/l",
    "ukat/l": "µkat/l",
    "µkat/l": "µkat/l",
    "nkat/l": "nkat/l",
    "u/ml": "U/ml",
    "iu/ml": "U/ml",
    "ku/l": "kU/l",
    "mg/gkreatinin": "mg/g Kreatinin",
    "mg/gcreatinin": "mg/g Kreatinin",
    "mg/gcreatinine": "mg/g Kreatinin",
    "mg/gkrea": "mg/g Kreatinin",
    "mg/gcrea": "mg/g Kreatinin",
    "mg/gcrt": "mg/g Kreatinin",
    "mg/gcrt.": "mg/g Kreatinin",
    "µg/gkreatinin": "µg/g Kreatinin",
    "µg/gcreatinin": "µg/g Kreatinin",
    "µg/gcreatinine": "µg/g Kreatinin",
    "µg/gkrea": "µg/g Kreatinin",
    "µg/gcrea": "µg/g Kreatinin",
    "µg/gcrea.": "µg/g Kreatinin",
    "ug/gkreatinin": "µg/g Kreatinin",
    "ug/gcrea": "µg/g Kreatinin",
    "ug/gcrea.": "µg/g Kreatinin",
    "/ul": "/µl",
    "/µl": "/µl",
    "/nl": "/nl",
    "1000/µl": "/nl",
    "1000/ul": "/nl",
    "10^3/µl": "/nl",
    "10^3/ul": "/nl",
    "x10^3/µl": "/nl",
    "x10^3/ul": "/nl",
    "tsd/µl": "/nl",
    "tsd/ul": "/nl",
    "tsnd/µl": "/nl",
    "tsnd/ul": "/nl",
    "tsnd./µl": "/nl",
    "tsnd./ul": "/nl",
    "xtsnd/µl": "/nl",
    "xtsnd/ul": "/nl",
    "xtsnd./µl": "/nl",
    "xtsnd./ul": "/nl",
    "mio./µl": "Mio./µl",
    "mio/µl": "Mio./µl",
    "mill./µl": "Mio./µl",
    "mill/µl": "Mio./µl",
    "10^6/µl": "Mio./µl",
    "10^6/ul": "Mio./µl",
    "/pl": "Mio./µl",
    "kbe/g": "KBE/g",
    "kbe/ml": "KBE/ml",
    "kopien/g": "Kopien/g",
    "fl": "fl",
    "%": "%",
  };
  return map[lower] || compact;
}

function unitInfo(unit) {
  const u = canonicalUnit(unit);
  const exact = {
    "g/l": ["mass", 1000],
    "g/dl": ["mass", 10000],
    "mg/l": ["mass", 1],
    "mg/dl": ["mass", 10],
    "µg/g": ["mass_per_mass", 1],
    "µg/ml": ["mass", 1],
    "µg/dl": ["mass", 0.01],
    "µg/l": ["mass", 0.001],
    "ng/ml": ["mass", 0.001],
    "ng/dl": ["mass", 0.00001],
    "ng/l": ["mass", 0.000001],
    "pg/ml": ["mass", 0.000001],
    "pg": ["cell_mass", 1],
    "U/l": ["activity", 1],
    "U/ml": ["activity", 1000],
    "kU/l": ["allergen_activity", 1],
    "mIU/l": ["thyroid_stimulation", 1],
    "Ratio": ["ratio", 1],
    "s": ["time", 1],
    "mg/g Kreatinin": ["creatinine_indexed_mass", 1],
    "µg/g Kreatinin": ["creatinine_indexed_mass", 0.001],
    "mmol/l": ["amount", 1e-3],
    "µmol/l": ["amount", 1e-6],
    "nmol/l": ["amount", 1e-9],
    "pmol/l": ["amount", 1e-12],
    "/µl": ["cells", 1],
    "/nl": ["cells", 1000],
    "G/l": ["cells", 1000],
    "T/l": ["erythrocytes", 1],
    "Mio./µl": ["erythrocytes", 1],
    "%": ["percent", 1],
    "fl": ["volume", 1],
  };
  const info = exact[u];
  return info ? { canonical: u, family: info[0], factor: info[1] } : null;
}

const CHART_UNIT_PROFILES = {
  "25-oh-vitamin d": {
    target: "nmol/l",
    units: { "nmol/l": 1, "µg/l": 2.496, "ng/ml": 2.496 },
  },
  "vitamin b12": {
    target: "pmol/l",
    units: { "pmol/l": 1, "pg/ml": 0.7378, "ng/l": 0.7378 },
  },
  calcium: {
    target: "mmol/l",
    units: { "mmol/l": 1, "mg/dl": 0.2495 },
  },
  glucose: {
    target: "mmol/l",
    units: { "mmol/l": 1, "mg/dl": 1 / 18.0182 },
  },
  harnstoff: {
    target: "mmol/l",
    units: { "mmol/l": 1, "mg/dl": 0.1665 },
  },
  eisen: {
    target: "µmol/l",
    units: { "µmol/l": 1, "µg/dl": 0.1791 },
  },
  transferrin: {
    target: "g/l",
    units: { "g/l": 1, "mg/dl": 0.01, "µmol/l": 0.07957 },
  },
  kalium: {
    target: "mmol/l",
    units: { "mmol/l": 1, "mval/l": 1, "mg/dl": 0.2557 },
  },
  natrium: {
    target: "mmol/l",
    units: { "mmol/l": 1, "mval/l": 1, "mg/dl": 0.4350 },
  },
};

function chartUnitInfo(row) {
  const canonical = canonicalUnit(row?.Einheit);
  const profile = CHART_UNIT_PROFILES[row?._key];
  const factor = profile?.units[canonical];
  if (Number.isFinite(factor)) {
    return {
      canonical: profile.target,
      sourceCanonical: canonical,
      family: `marker:${row._key}`,
      factor,
    };
  }
  return unitInfo(row?.Einheit);
}

function convertNumber(value, fromInfo, targetInfo) {
  if (value === null || !fromInfo || !targetInfo || fromInfo.family !== targetInfo.family) return null;
  return (value * fromInfo.factor) / targetInfo.factor;
}

function convertBioAgeUnit(row, factors) {
  if (!row || row._value === null) return null;
  const unit = canonicalUnit(row.Einheit);
  const factor = factors[unit];
  return Number.isFinite(factor) ? row._value * factor : null;
}

function convertHbA1cForBortz(row) {
  if (!row || row._value === null) return null;
  const unit = canonicalUnit(row.Einheit);
  if (unit === "mmol/mol") return row._value;
  if (unit === "%") return (row._value - 2.15) * 10.929;
  return null;
}

function currentBioAgeModel() {
  return BIO_AGE_MODELS[state.activeBioAgeModel] || BIO_AGE_MODELS.phenoage;
}

function currentBioAgeMarkers() {
  return currentBioAgeModel().markers;
}

function loadBioAgeManualValues() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BIO_AGE_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveBioAgeManualValues() {
  const model = currentBioAgeModel();
  const values = { ...state.bioAgeManualValues };
  for (const marker of currentBioAgeMarkers()) {
    const input = document.getElementById(`bio-${marker.key}`);
    if (!input) continue;
    const value = parseLooseNumber(input.value);
    const auto = state.bioAgeAutoValues[marker.key]?.value ?? null;
    const fallback = bioAgeFallbackValue(marker, model);
    if (value !== null && !bioValuesMatch(value, auto) && !bioValuesMatch(value, fallback)) {
      values[marker.key] = value;
    } else {
      delete values[marker.key];
    }
  }
  const age = parseLooseNumber(els.bioChronAge?.value);
  if (age !== null) values.age = age;
  else delete values.age;
  state.bioAgeManualValues = values;
  localStorage.setItem(BIO_AGE_STORAGE_KEY, JSON.stringify(values));
  if (els.bioBirthDate?.value) localStorage.setItem(BIO_AGE_BIRTHDATE_KEY, els.bioBirthDate.value);
  renderBioAge();
}

function clearBioAgeManualValues() {
  state.bioAgeManualValues = {};
  localStorage.removeItem(BIO_AGE_STORAGE_KEY);
  localStorage.removeItem(BIO_AGE_BIRTHDATE_KEY);
  if (els.bioBirthDate) els.bioBirthDate.value = DEFAULT_BIO_AGE_BIRTHDATE;
  if (els.bioChronAge) els.bioChronAge.value = "";
  fillBioAgeInputsFromAuto();
  renderBioAge();
}

function parseLooseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatBioNumber(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function bioValuesMatch(a, b, tolerance = 0.005) {
  return a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < tolerance;
}

function bioAgeFallbackValue(marker, model = currentBioAgeModel()) {
  if (model.allowAverageFallback && marker.mean !== undefined) return marker.mean;
  if (model.allowMedianFallback && marker.median !== undefined) return marker.median;
  return null;
}

function bioAgeFallbackLabel(model) {
  return model.allowAverageFallback ? "Durchschnitt" : "Median";
}

function bioAgeInputSourceType(marker, value, auto, model = currentBioAgeModel()) {
  if (auto && bioValuesMatch(value, auto.value)) return "auto";
  const fallback = bioAgeFallbackValue(marker, model);
  if (fallback !== null && bioValuesMatch(value, fallback)) return "fallback";
  if (value !== null) return "manual";
  if (fallback !== null) return "fallback";
  return "missing";
}

function bioAgeDateForAge(values) {
  const dates = Object.values(values)
    .map((item) => item?.row?._date)
    .filter(Boolean)
    .sort((a, b) => a - b);
  return dates.at(-1) || new Date();
}

function bioAgeMarkerIdeal(marker, model = currentBioAgeModel()) {
  if (model.key === "bortz" && marker.mean !== undefined) {
    const value = marker.log ? Math.exp(marker.mean) : marker.mean;
    return `${formatBioNumber(value, value < 2 ? 2 : 1)} ${marker.unit}`;
  }
  if (marker.median !== undefined) {
    return `${formatBioNumber(marker.median, marker.median < 2 ? 2 : 1)} ${marker.unit}`;
  }
  return `Referenzbereich (${marker.unit})`;
}

function bioAgeMarkerCoefficient(marker, model = currentBioAgeModel()) {
  if (model.key === "phenoage") {
    return BIO_AGE_COEFFICIENTS[marker.key === "crp" ? "logCRP" : marker.key] ?? null;
  }
  return marker.coefficient ?? null;
}

function bioAgeMarkerDirection(marker, model = currentBioAgeModel()) {
  const coefficient = bioAgeMarkerCoefficient(marker, model);
  if (coefficient === null) return "möglichst stabil im Referenzbereich";
  return coefficient < 0 ? "eher höher" : "eher niedriger";
}

function bioAgeMarkerHelp(marker, model = currentBioAgeModel()) {
  const template = BIO_AGE_MARKER_INFO[marker.key];
  if (template) {
    return template.replace("{ideal}", bioAgeMarkerIdeal(marker, model));
  }
  return `Gut ist ein stabiler Referenzbereich. Im ${model.shortLabel}-Modell ist tendenziell ${bioAgeMarkerDirection(marker, model)} günstiger. Ideal/Anker: ${bioAgeMarkerIdeal(marker, model)}.`;
}

function yearsBetween(start, end) {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return Number.isFinite(ms) ? ms / 365.2425 / 24 / 60 / 60 / 1000 : null;
}

function findBioAgeAutoValues() {
  const values = {};
  for (const marker of currentBioAgeMarkers()) {
    const candidates = state.rows
      .filter((row) => row._date && row._value !== null && marker.match(row))
      .map((row) => ({ row, value: marker.convert(row) }))
      .filter((item) => item.value !== null && Number.isFinite(item.value))
      .sort((a, b) => b.row._date - a.row._date || String(a.row.Standardname).localeCompare(String(b.row.Standardname), "de"));
    values[marker.key] = candidates[0] || null;
  }
  return values;
}

function setupBioAge() {
  if (!els.bioAgeInputs) return;
  const model = currentBioAgeModel();
  state.bioAgeAutoValues = findBioAgeAutoValues();
  state.bioAgeManualValues = loadBioAgeManualValues();
  if (els.bioAgeEyebrow) els.bioAgeEyebrow.textContent = model.eyebrow;
  if (els.bioAgeSubtitle) els.bioAgeSubtitle.textContent = model.subtitle;
  for (const button of els.bioAgeModelButtons) {
    const active = button.dataset.bioAgeModel === model.key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  els.bioAgeInputs.innerHTML = model.markers.map((marker) => `
    <div class="ageField ageMarkerField">
      <div class="ageFieldHeader">
        <label class="ageFieldLabel" for="bio-${escapeAttr(marker.key)}">
          <span class="ageFieldTitle">${escapeHtml(marker.label)}</span>
        </label>
        <span class="ageFieldMeta">
          <button class="ageInfoIcon" type="button" aria-label="Info zu ${escapeAttr(marker.label)}" data-tooltip="${escapeAttr(bioAgeMarkerHelp(marker, model))}">?</button>
          <small>${escapeHtml(marker.required ? `Pflicht · ${marker.unit}` : marker.unit)}</small>
        </span>
      </div>
      <input id="bio-${escapeAttr(marker.key)}" data-bio-marker="${escapeAttr(marker.key)}" type="number" inputmode="decimal" step="0.01">
      <small id="bio-${escapeAttr(marker.key)}-source" class="ageInputSource"></small>
    </div>
  `).join("");
  const savedBirthDate = localStorage.getItem(BIO_AGE_BIRTHDATE_KEY) || DEFAULT_BIO_AGE_BIRTHDATE;
  if (savedBirthDate && els.bioBirthDate) els.bioBirthDate.value = savedBirthDate;
  fillBioAgeInputsFromAuto();
  renderBioAge();
}

function fillBioAgeInputsFromAuto() {
  if (!els.bioAgeInputs) return;
  const model = currentBioAgeModel();
  for (const marker of currentBioAgeMarkers()) {
    const input = document.getElementById(`bio-${marker.key}`);
    if (!input) continue;
    const manual = state.bioAgeManualValues[marker.key];
    const auto = state.bioAgeAutoValues[marker.key]?.value ?? null;
    const fallback = model.fillFallbackInputs ? bioAgeFallbackValue(marker, model) : null;
    const value = manual ?? auto ?? fallback;
    input.value = value === null || value === undefined ? "" : String(Math.round(value * 100) / 100);
  }
  const dateForAge = bioAgeDateForAge(state.bioAgeAutoValues);
  if (els.bioBirthDate?.value && els.bioChronAge) {
    const years = yearsBetween(toDate(els.bioBirthDate.value), dateForAge);
    if (years !== null && years > 0) els.bioChronAge.value = String(Math.round(years * 10) / 10);
  } else if (state.bioAgeManualValues.age !== undefined && els.bioChronAge) {
    els.bioChronAge.value = String(state.bioAgeManualValues.age);
  }
}

function currentBioAgeInputs() {
  const inputs = {};
  for (const marker of currentBioAgeMarkers()) {
    inputs[marker.key] = parseLooseNumber(document.getElementById(`bio-${marker.key}`)?.value);
  }
  inputs.age = parseLooseNumber(els.bioChronAge?.value);
  return inputs;
}

function computePhenoAge(inputs) {
  const C = BIO_AGE_COEFFICIENTS;
  const value = (key) => inputs[key] ?? PHENO_AGE_MARKERS.find((marker) => marker.key === key)?.median ?? 0;
  const crp = Math.max((inputs.crp ?? PHENO_AGE_MARKERS.find((marker) => marker.key === "crp").median) / 10, 0.0001);
  const xb =
    C.albumin * value("albumin") +
    C.creatinine * value("creatinine") +
    C.glucose * value("glucose") +
    C.logCRP * Math.log(crp) +
    C.lymphocyte * value("lymphocyte") +
    C.mcv * value("mcv") +
    C.rdw * value("rdw") +
    C.alp * value("alp") +
    C.wbc * value("wbc") +
    C.age * inputs.age +
    C.intercept;
  const gamma = 0.0076927;
  const mortalityScore = 1 - Math.exp((-1.51714 * Math.exp(xb)) / gamma);
  const safeScore = Math.min(Math.max(mortalityScore, 1e-9), 1 - 1e-9);
  return 141.50225 + Math.log(-0.00553 * Math.log(1 - safeScore)) / 0.090165;
}

function computeBortzBloodAge(inputs) {
  const markers = BORTZ_AGE_MARKERS;
  const missingRequired = markers.filter((marker) => marker.required && inputs[marker.key] === null);
  const missingOptional = markers.filter((marker) => !marker.required && inputs[marker.key] === null);
  const maxMissing = BIO_AGE_MODELS.bortz.maxMissingOptional;
  if (inputs.age === null || inputs.age < 18 || inputs.age > 110) {
    return { ok: false, reason: "Chronologisches Alter fehlt.", missingRequired, missingOptional };
  }
  if (missingRequired.length || missingOptional.length > maxMissing) {
    return { ok: false, reason: "Für Bortz Blood Age fehlen noch zu viele Werte.", missingRequired, missingOptional };
  }

  const used = [
    {
      key: "age",
      value: inputs.age,
      coefficient: -0.025669127,
      mean: 56.0487752,
    },
  ];
  for (const marker of markers) {
    const value = inputs[marker.key];
    if (value === null) continue;
    const base = marker.log ? Math.log(Math.max(value, 0.0001)) : value;
    used.push({ ...marker, value, base });
  }
  const ageAcceleration = 10 * used.reduce((sum, marker) => {
    const base = marker.key === "age" ? marker.value : marker.base;
    return sum + ((base - marker.mean) * marker.coefficient);
  }, 0);
  return {
    ok: true,
    value: inputs.age + ageAcceleration,
    delta: ageAcceleration,
    usedCount: used.length - 1,
    missingRequired,
    missingOptional,
    missingOptionalUsed: missingOptional.length,
  };
}

function bioAgeTier(delta) {
  if (delta <= -5) return { label: "deutlich jünger", className: "ok" };
  if (delta <= -2) return { label: "etwas jünger", className: "ok" };
  if (delta <= 2) return { label: "nahe am chronologischen Alter", className: "" };
  if (delta <= 5) return { label: "etwas älter", className: "open" };
  return { label: "deutlich älter", className: "attention" };
}

function bioAgeDateSpan() {
  const dates = Object.values(state.bioAgeAutoValues)
    .map((item) => item?.row?._date)
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (!dates.length) return { min: null, max: null, days: 0 };
  return {
    min: dates[0],
    max: dates.at(-1),
    days: Math.round((dates.at(-1) - dates[0]) / 86400000),
  };
}

function renderBioAgeSourceText(marker, value, auto) {
  if (auto && bioValuesMatch(value, auto.value)) {
    return {
      text: `${formatDate(auto.row._date)} · ${auto.row.Standardname || auto.row.Name_im_Bericht} · ${auto.row.Ergebnis_text || auto.row.Ergebnis} ${auto.row.Einheit}`,
      className: "",
    };
  }
  const model = currentBioAgeModel();
  const fallback = bioAgeFallbackValue(marker, model);
  if (fallback !== null && bioValuesMatch(value, fallback)) {
    return { text: `${bioAgeFallbackLabel(model)} ${formatBioNumber(fallback, 2)} ${marker.unit}`, className: "fallback" };
  }
  if (value !== null) return { text: "manuell", className: "manual" };
  if (fallback !== null) {
    return { text: `${bioAgeFallbackLabel(model)} ${formatBioNumber(fallback, 2)} ${marker.unit}`, className: "fallback" };
  }
  return { text: marker.required ? "Pflichtwert fehlt" : "nicht verwendet", className: "manual" };
}

function renderBioAgeFormulaNote(model) {
  const links = (model.formulaLinks || [])
    .map((link) => `<a href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`)
    .join(" · ");
  return `${escapeHtml(model.formulaNote)}${links ? ` Quellen: ${links}` : ""}`;
}

function renderBioAge() {
  if (!els.bioAgeResult) return;
  const model = currentBioAgeModel();
  const markers = model.markers;
  const inputs = currentBioAgeInputs();
  const markerSources = markers.map((marker) => {
    const auto = state.bioAgeAutoValues[marker.key];
    const value = inputs[marker.key];
    const fallback = bioAgeFallbackValue(marker, model);
    const type = bioAgeInputSourceType(marker, value, auto, model);
    return { marker, auto, value, fallback, type };
  });
  const providedMarkers = markerSources.filter((item) => item.type === "auto" || item.type === "manual");
  const fallbackMarkers = markerSources.filter((item) => item.type === "fallback");
  const effectiveMarkers = markerSources.filter((item) => item.type !== "missing");
  const span = bioAgeDateSpan();
  const hasAge = inputs.age !== null && inputs.age >= 18 && inputs.age <= 110;
  const completeness = `${effectiveMarkers.length}/${markers.length}`;
  els.bioAgeCompleteness.textContent = completeness;
  els.bioAgeSourceCount.textContent = fallbackMarkers.length
    ? `${providedMarkers.length.toLocaleString("de-DE")} + ${fallbackMarkers.length.toLocaleString("de-DE")} Ø`
    : providedMarkers.length.toLocaleString("de-DE");
  els.bioAgeStats.innerHTML = `
    <div class="topicStat">
      <span>Werte</span>
      <strong>${completeness}</strong>
      <small>${escapeHtml(fallbackMarkers.length ? `${model.markerNote}, ${fallbackMarkers.length} geschätzt` : model.markerNote)}</small>
    </div>
    <div class="topicStat ${span.days > 90 ? "open" : "ok"}">
      <span>Zeitraum</span>
      <strong>${span.days ? `${span.days} T.` : "-"}</strong>
      <small>${span.min && span.max ? `${formatShortDate(span.min)} bis ${formatShortDate(span.max)}` : "keine Automatik"}</small>
    </div>
  `;

  for (const marker of markers) {
    const source = document.getElementById(`bio-${marker.key}-source`);
    const auto = state.bioAgeAutoValues[marker.key];
    const input = document.getElementById(`bio-${marker.key}`);
    const value = parseLooseNumber(input?.value);
    if (!source) continue;
    const rendered = renderBioAgeSourceText(marker, value, auto);
    source.textContent = rendered.text;
    source.classList.toggle("manual", rendered.className === "manual");
    source.classList.toggle("fallback", rendered.className === "fallback");
  }

  els.bioAgeSources.innerHTML = markerSources.map(({ marker, auto, value: inputValue, fallback, type }) => {
    const usedManual = type === "manual";
    const usedFallback = type === "fallback";
    const title = auto?.row ? `${auto.row.Standardname || auto.row.Name_im_Bericht}` : "kein passender Laborwert";
    const detail = auto?.row
      ? `${formatDate(auto.row._date)} · ${auto.row.Labor} · ${auto.row.Ergebnis_text || auto.row.Ergebnis} ${auto.row.Einheit}`
      : fallback !== null
        ? `${bioAgeFallbackLabel(model)}: ${formatBioNumber(fallback, 2)} ${marker.unit}`
        : marker.required ? "Pflichtwert fehlt" : "nicht verwendet";
    const displayValue = inputValue !== null
      ? `${formatBioNumber(inputValue, 2)} ${marker.unit}`
      : fallback !== null
        ? `${formatBioNumber(fallback, 2)} ${marker.unit}`
        : "-";
    const sourceText = usedManual
      ? `manuell · ${detail}`
      : usedFallback
        ? `${bioAgeFallbackLabel(model)}swert · ${detail}`
        : `${title} · ${detail}`;
    return `
      <article class="ageSourceItem ${usedManual ? "manual" : usedFallback ? "fallback" : auto ? "auto" : "missing"}">
        <strong>${escapeHtml(marker.label)}</strong>
        <span>${escapeHtml(displayValue)}</span>
        <small>${escapeHtml(sourceText)}</small>
      </article>
    `;
  }).join("");

  if (!hasAge) {
    els.bioAgeResult.innerHTML = `
      <p class="ageResultPlaceholder">Chronologisches Alter fehlt.</p>
      <p class="ageResultNote">Geburtsdatum oder Alter eintragen.</p>
    `;
    return;
  }

  const result = model.key === "bortz"
    ? computeBortzBloodAge(inputs)
    : { ok: true, value: computePhenoAge(inputs), delta: computePhenoAge(inputs) - inputs.age };
  if (!result.ok) {
    const missingRequired = result.missingRequired?.map((marker) => marker.label).join(", ");
    const missingOptional = result.missingOptional?.length || 0;
    els.bioAgeResult.innerHTML = `
      <p class="ageResultPlaceholder">${escapeHtml(result.reason || "Berechnung noch nicht möglich.")}</p>
      ${missingRequired ? `<p class="ageResultWarning">Pflichtwerte fehlen: ${escapeHtml(missingRequired)}.</p>` : ""}
      ${missingOptional > (model.maxMissingOptional || 0) ? `<p class="ageResultWarning">${missingOptional} optionale Werte fehlen; erlaubt sind höchstens ${model.maxMissingOptional}.</p>` : ""}
      <p class="ageResultNote">Du kannst fehlende Werte manuell eintragen oder neueste Werte automatisch übernehmen.</p>
    `;
    return;
  }

  const biologicalAge = result.value;
  const delta = result.delta ?? biologicalAge - inputs.age;
  const tier = bioAgeTier(delta);
  const missing = markers.length - effectiveMarkers.length;
  const spanWarning = span.days > 90
    ? `<p class="ageResultWarning">Die automatisch verwendeten Werte liegen über ${span.days.toLocaleString("de-DE")} Tage verteilt.</p>`
    : "";
  const missingWarning = fallbackMarkers.length
    ? `<p class="ageResultWarning">${fallbackMarkers.length} fehlende Marker mit ${escapeHtml(bioAgeFallbackLabel(model))}swerten ergänzt.</p>`
    : missing && model.allowMedianFallback
      ? `<p class="ageResultWarning">${missing} fehlende Marker mit Medianwerten ergänzt.</p>`
    : missing && model.key === "bortz"
      ? `<p class="ageResultWarning">${missing} optionale Marker fehlen und wurden im Bortz-Modell ausgelassen.</p>`
      : "";
  els.bioAgeResult.innerHTML = `
    <div class="ageResultNumber">
      <strong>${formatBioNumber(biologicalAge, 1)}</strong>
      <span>Jahre</span>
    </div>
    <div class="ageDelta ${tier.className}">
      <strong>${delta >= 0 ? "+" : ""}${formatBioNumber(delta, 1)} Jahre</strong>
      <span>${escapeHtml(tier.label)}</span>
    </div>
    ${spanWarning}
    ${missingWarning}
    <p class="ageResultFormula">${renderBioAgeFormulaNote(model)}</p>
  `;
}

function setBioAgeModel(modelKey) {
  if (!BIO_AGE_MODELS[modelKey]) return;
  state.activeBioAgeModel = modelKey;
  localStorage.setItem(BIO_AGE_MODEL_STORAGE_KEY, modelKey);
  setupBioAge();
}

function handleBioBirthDateChange() {
  if (els.bioBirthDate?.value) {
    localStorage.setItem(BIO_AGE_BIRTHDATE_KEY, els.bioBirthDate.value);
    const years = yearsBetween(toDate(els.bioBirthDate.value), bioAgeDateForAge(state.bioAgeAutoValues));
    if (years !== null && years > 0) els.bioChronAge.value = String(Math.round(years * 10) / 10);
  } else {
    localStorage.removeItem(BIO_AGE_BIRTHDATE_KEY);
  }
  renderBioAge();
}

function normalizeRowsForChart(rows) {
  const numeric = rows.filter((row) => row._date && row._value !== null);
  const withInfo = numeric.map((row) => ({ row, info: chartUnitInfo(row) })).filter((x) => x.info);
  if (!withInfo.length) {
    return {
      rows: rows.map((row) => ({
        ...row,
        _plotValue: row._value,
        _plotRefMin: row._refMin,
        _plotRefMax: row._refMax,
        _plotUnit: row.Einheit || "",
        _plotOriginalUnit: row.Einheit || "",
        _plotConverted: false,
      })),
      targetUnit: unique(rows.map((r) => r.Einheit).filter(Boolean)).join(", ") || "",
      convertedCount: 0,
      excludedCount: 0,
    };
  }

  const targetFamily = mostCommon(withInfo.map((x) => x.info.family));
  const compatible = withInfo.filter((x) => x.info.family === targetFamily);
  const targetUnit = mostCommon(compatible.map((x) => x.info.canonical));
  const targetInfo = targetFamily.startsWith("marker:")
    ? { canonical: targetUnit, family: targetFamily, factor: 1 }
    : compatible.find((x) => x.info.canonical === targetUnit)?.info || null;
  let convertedCount = 0;
  let excludedCount = 0;

  const normalized = rows.map((row) => {
    const info = chartUnitInfo(row);
    const canConvert = row._value !== null && info && targetInfo && info.family === targetInfo.family;
    if (row._value !== null && !canConvert && row.Einheit) excludedCount += 1;
    if (!canConvert) {
      return {
        ...row,
        _plotValue: null,
        _plotRefMin: null,
        _plotRefMax: null,
        _plotUnit: targetUnit,
        _plotOriginalUnit: row.Einheit || "",
        _plotConverted: false,
      };
    }
    const plotValue = convertNumber(row._value, info, targetInfo);
    const plotRefMin = convertNumber(row._refMin, info, targetInfo);
    const plotRefMax = convertNumber(row._refMax, info, targetInfo);
    const wasConverted = (info.sourceCanonical || info.canonical) !== targetUnit || info.factor !== targetInfo.factor;
    if (wasConverted) convertedCount += 1;
    return {
      ...row,
      _plotValue: plotValue,
      _plotRefMin: plotRefMin,
      _plotRefMax: plotRefMax,
      _plotUnit: targetUnit,
      _plotOriginalUnit: row.Einheit || "",
      _plotConverted: wasConverted,
    };
  });

  return { rows: normalized, targetUnit, convertedCount, excludedCount };
}

function toDate(value) {
  const d = new Date(`${value}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDate(date) {
  return date.toLocaleDateString("de-DE", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatShortDate(date) {
  return date.toLocaleDateString("de-DE", { year: "2-digit", month: "2-digit", day: "2-digit" });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function setupDateFilter(rows) {
  const dates = rows.map((r) => r._date).filter(Boolean).sort((a, b) => a - b);
  state.dateMin = dates[0];
  state.dateMax = dates.at(-1);
  state.dateStart = state.dateMin;
  state.dateEnd = state.dateMax;
  for (const input of [els.dateStartInput, els.dateEndInput]) {
    input.min = isoDate(state.dateMin);
    input.max = isoDate(state.dateMax);
  }
  syncDateInputs();
  updateDateRangeLabel();
}

function syncDateInputs() {
  els.dateStartInput.value = isoDate(state.dateStart);
  els.dateEndInput.value = isoDate(state.dateEnd);
}

function updateDateRangeFromInputs() {
  const start = toDate(els.dateStartInput.value) || state.dateMin;
  const end = toDate(els.dateEndInput.value) || state.dateMax;
  state.dateStart = start <= end ? start : end;
  state.dateEnd = end >= start ? end : start;
  syncDateInputs();
  updateDateRangeLabel();
}

function resetDateFilter() {
  if (!state.dateMin || !state.dateMax) return;
  state.dateStart = state.dateMin;
  state.dateEnd = state.dateMax;
  syncDateInputs();
  updateDateRangeLabel();
}

function updateDateRangeLabel() {
  if (!state.dateStart || !state.dateEnd) {
    els.dateRangeLabel.textContent = "Alle Daten";
    return;
  }
  els.dateRangeLabel.textContent = `${formatDate(state.dateStart)} bis ${formatDate(state.dateEnd)}`;
}

function mapRows(table) {
  const headers = table[0];
  return table.slice(1).map((cells, index) => {
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] || "";
    });
    row._rowId = `row-${index}`;
    row._date = toDate(row.Datum);
    row._value = toNumber(row.Ergebnis);
    row._refMin = toNumber(row.Referenz_min);
    row._refMax = toNumber(row.Referenz_max);
    row._key = aliasKey(row);
    return row;
  }).filter((r) => r.Datum && r.Name_im_Bericht);
}

function buildGroups(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row._key)) map.set(row._key, []);
    map.get(row._key).push(row);
  }
  return [...map.entries()].map(([key, groupRows]) => {
    const displayName = displayNameForGroup(groupRows, key);
    const aliases = searchAliasesForGroup(groupRows, key, displayName);
    const categories = unique(groupRows.map((r) => r.Kategorie)).slice(0, 4).join(", ");
    const units = unique(groupRows.map((r) => r.Einheit).filter(Boolean));
    const searchable = normalizeSearchText([
      displayName,
      key,
      ...aliases,
      ...groupRows.flatMap((r) => [r.Standardname, r.Name_im_Bericht, r.Kategorie, r.Labor]),
    ].join(" "));
    return { key, displayName, aliases, rows: groupRows, categories, units, searchable };
  }).sort((a, b) => b.rows.length - a.rows.length || a.displayName.localeCompare(b.displayName, "de"));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
}

function populateSelect(select, label, values) {
  if (!select) return;
  select.innerHTML = "";
  select.append(new Option(label, ""));
  for (const value of values) select.append(new Option(value, value));
}

function filteredRows(rows = state.rows) {
  const category = els.categoryFilter?.value || "";
  const lab = els.labFilter?.value || "";
  const status = els.statusFilter?.value || "";
  return rows.filter((row) => {
    if (category && row.Kategorie !== category) return false;
    if (lab && row.Labor !== lab) return false;
    if (status === "auffaellig" && !["erhöht", "erniedrigt", "grenzwertig", "auffällig/positiv"].includes(row.Bewertung)) return false;
    if (status && status !== "auffaellig" && row.Bewertung !== status) return false;
    return true;
  });
}

function dateFilteredRows(rows) {
  const start = state.dateStart?.getTime();
  const end = state.dateEnd?.getTime();
  return rows.filter((row) => {
    if (row._date && start !== undefined && row._date.getTime() < start) return false;
    if (row._date && end !== undefined && row._date.getTime() > end) return false;
    return true;
  });
}

function seriesColor(index) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function selectedGroups() {
  return state.selectedKeys
    .map((key) => state.groups.find((group) => group.key === key))
    .filter(Boolean);
}

function selectMatchGroup(group, options = {}) {
  state.hasUserSelection = true;
  if (options.replace || !state.compareMode) {
    state.selectedKeys = [group.key];
  } else if (state.selectedKeys.includes(group.key)) {
    state.selectedKeys = state.selectedKeys.filter((key) => key !== group.key);
  } else {
    state.selectedKeys = [...state.selectedKeys, group.key];
  }
  state.selectedKey = state.selectedKeys[0] || null;
  state.selectedRowId = null;
  resetChartZoom();
  renderSelected();
  updateMatches({ suggestions: options.suggestions !== false });
}

function groupSearchScore(group, query) {
  const name = normalizeText(group.displayName);
  const aliases = (group.aliases || []).map(normalizeText);
  const tokens = group.searchable.split(/\s+/).filter(Boolean);
  if (aliases.includes(query)) return 0;
  if (name === query) return 0;
  if (tokens.includes(query)) return 3;
  if (EXACT_SHORT_SEARCH_TERMS.has(query)) return 9;
  if (aliases.some((alias) => alias.startsWith(query))) return 1;
  if (name.startsWith(query)) return 1;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (tokens.some((token) => token.startsWith(query))) return 4;
  if (query.length >= 4 && group.searchable.includes(query)) return 5;
  return 9;
}

function aliasLabel(group) {
  const aliases = group.aliases || [];
  return aliases.length ? ` · auch: ${aliases.slice(0, 3).join(", ")}` : "";
}

function hideSearchSuggestions() {
  els.searchSuggest.hidden = true;
  els.searchInput.setAttribute("aria-expanded", "false");
  state.searchSuggestIndex = -1;
}

function updateActiveSearchSuggestion(index) {
  const items = [...els.searchSuggest.querySelectorAll("[data-suggestion-key]")];
  state.searchSuggestIndex = items.length ? (index + items.length) % items.length : -1;
  items.forEach((item, itemIndex) => {
    const active = itemIndex === state.searchSuggestIndex;
    item.classList.toggle("active", active);
    item.setAttribute("aria-selected", String(active));
    if (active) item.scrollIntoView({ block: "nearest" });
  });
}

function renderSearchSuggestions(groups = []) {
  const query = normalizeSearchText(els.searchInput.value);
  if (!query || document.activeElement !== els.searchInput) {
    hideSearchSuggestions();
    return;
  }

  const suggestions = groups
    .filter((group) => groupSearchScore(group, query) < 9)
    .sort((a, b) => groupSearchScore(a, query) - groupSearchScore(b, query) || b.rows.length - a.rows.length || a.displayName.localeCompare(b.displayName, "de"))
    .slice(0, 8);

  if (!suggestions.length) {
    hideSearchSuggestions();
    return;
  }

  els.searchSuggest.innerHTML = suggestions.map((group, index) => `
    <button class="searchSuggestItem" type="button" role="option" data-suggestion-key="${escapeAttr(group.key)}" aria-selected="${index === state.searchSuggestIndex}">
      <strong>${escapeHtml(group.displayName)}</strong>
      <span>${group.rows.length} Messungen · ${escapeHtml(group.categories || "ohne Kategorie")}${escapeHtml(aliasLabel(group))}</span>
    </button>
  `).join("");
  els.searchSuggest.hidden = false;
  els.searchInput.setAttribute("aria-expanded", "true");
  updateActiveSearchSuggestion(Math.max(0, state.searchSuggestIndex));
}

function applySearchSuggestion(key) {
  const group = state.groups.find((item) => item.key === key);
  if (!group) return;
  els.searchInput.value = group.displayName;
  hideSearchSuggestions();
  selectMatchGroup(group, { replace: true, suggestions: false });
}

function handleSearchSuggestKeydown(event) {
  if (event.key === "Escape") {
    hideSearchSuggestions();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;

  const items = [...els.searchSuggest.querySelectorAll("[data-suggestion-key]")];
  if (els.searchSuggest.hidden || !items.length) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") renderSearchSuggestions();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    updateActiveSearchSuggestion(state.searchSuggestIndex + 1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    updateActiveSearchSuggestion(state.searchSuggestIndex - 1);
    return;
  }
  if (event.key === "Enter" && state.searchSuggestIndex >= 0) {
    event.preventDefault();
    applySearchSuggestion(items[state.searchSuggestIndex].dataset.suggestionKey);
  }
}

function updateMatches(options = {}) {
  const query = normalizeSearchText(els.searchInput.value);
  const allowedRows = filteredRows();
  const allowed = new Set(allowedRows.map((r) => r._key));
  const groups = state.groups
    .filter((g) => allowed.has(g.key))
    .filter((g) => !query || groupSearchScore(g, query) < 9)
    .map((g) => ({ ...g, rows: g.rows.filter((r) => allowedRows.includes(r)) }))
    .filter((g) => g.rows.length)
    .sort((a, b) => {
      if (query) {
        const score = groupSearchScore(a, query) - groupSearchScore(b, query);
        if (score !== 0) return score;
      }
      return b.rows.length - a.rows.length || a.displayName.localeCompare(b.displayName, "de");
    })
    .slice(0, 80);

  els.matchCount.textContent = String(groups.length);
  els.matchList.innerHTML = "";
  const selected = new Set(state.selectedKeys);
  for (const group of groups) {
    const button = document.createElement("button");
    button.type = "button";
    const isActive = selected.has(group.key);
    button.className = `matchItem${isActive ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(isActive));
    button.innerHTML = `<strong>${escapeHtml(group.displayName)}</strong><span>${group.rows.length} Messungen · ${escapeHtml(group.categories || "ohne Kategorie")}${escapeHtml(aliasLabel(group))}</span>`;
    button.addEventListener("click", () => {
      hideSearchSuggestions();
      selectMatchGroup(group, { suggestions: false });
    });
    els.matchList.append(button);
  }
  if (options.suggestions === false) hideSearchSuggestions();
  else renderSearchSuggestions(groups);

  if (!state.hasUserSelection && !state.selectedKeys.length && groups[0]) {
    state.selectedKeys = [groups[0].key];
    state.selectedKey = groups[0].key;
    resetChartZoom();
    renderSelected();
    updateMatches();
  } else {
    state.selectedKeys = state.selectedKeys.filter((key) => state.groups.some((group) => group.key === key));
    state.selectedKey = state.selectedKeys[0] || null;
    renderSelected();
  }
}

function renderSelected() {
  const groups = selectedGroups();
  if (!groups.length) {
    els.selectedName.textContent = "Noch kein Wert gewählt";
    els.selectedCount.textContent = "0";
    els.selectedRange.textContent = "-";
    els.latestValue.textContent = "-";
    els.chartSubtitle.textContent = state.compareMode ? "Wähle einen oder mehrere Treffer aus." : "Wähle links einen Treffer aus.";
    els.historyRows.innerHTML = "";
    state.chartRows = [];
    drawChart([]);
    return;
  }

  const series = groups.map((group, index) => {
    const color = seriesColor(index);
    const rows = dateFilteredRows(filteredRows(group.rows))
      .sort((a, b) => (a._date?.getTime() || 0) - (b._date?.getTime() || 0))
      .map((row) => ({
        ...row,
        _seriesKey: group.key,
        _seriesName: group.displayName,
        _seriesColor: color,
      }));
    return { group, rows, color };
  });
  const rows = series.flatMap((item) => item.rows).sort((a, b) => (a._date?.getTime() || 0) - (b._date?.getTime() || 0));
  const chartData = groups.length > 1
    ? buildMultiSeriesChartData(series)
    : els.sameUnitOnly.checked
      ? normalizeRowsForChart(rows)
      : {
          rows: rows.map((row) => ({
            ...row,
            _plotValue: row._value,
            _plotRefMin: row._refMin,
            _plotRefMax: row._refMax,
            _plotUnit: row.Einheit || "",
            _plotOriginalUnit: row.Einheit || "",
            _plotConverted: false,
          })),
          targetUnit: unique(rows.map((r) => r.Einheit).filter(Boolean)).join(", ") || "",
          convertedCount: 0,
          excludedCount: 0,
        };

  const latest = rows.at(-1);
  els.selectedName.textContent = groups.length === 1 ? groups[0].displayName : `${groups.length} Werte ausgewählt`;
  els.selectedCount.textContent = String(rows.length);
  els.selectedRange.textContent = rows.length ? `${formatShortDate(rows[0]._date)} - ${formatShortDate(rows.at(-1)._date)}` : "-";
  els.latestValue.textContent = latest
    ? `${groups.length > 1 ? `${latest._seriesName}: ` : ""}${latest.Ergebnis_text || latest.Ergebnis} ${latest.Einheit || ""}`.trim()
    : "-";
  state.chartRows = chartData.rows;
  els.chartSubtitle.textContent = chartSubtitleText(groups, rows, chartData);
  renderTable(sortTableRows(rows));
  drawChart(chartData.rows);
}

function chartSubtitleText(groups, rows, chartData) {
  if (!rows.length) return "Keine Werte für die aktuellen Filter.";
  const tableUnits = unitList(rows.map((r) => r.Einheit).filter(Boolean)) || "ohne Einheit";
  const excludedNote = chartData.excludedCount ? ` · ${chartData.excludedCount} nicht kompatibel für die Grafik` : "";
  if (groups.length > 1) {
    const seriesNames = groups.map((group) => group.displayName).join(", ");
    return `${seriesNames} · Vergleichsmodus: Y-Achse relativ zum jeweiligen Referenzbereich${excludedNote} · Tabelle in Originaleinheiten: ${tableUnits}`;
  }
  const chartUnit = els.sameUnitOnly.checked
    ? chartData.targetUnit
      ? `Grafik in ${chartData.targetUnit}`
      : "Grafik ohne Einheit"
    : "Grafik mit Originalwerten ohne Vereinheitlichung";
  const conversionNote = chartData.convertedCount ? ` · ${chartData.convertedCount} umgerechnet` : "";
  return `${groups[0].displayName} · ${chartUnit}${conversionNote}${excludedNote} · Tabelle in Originaleinheiten: ${tableUnits}`;
}

function unitList(values, limit = 4) {
  const units = unique(values);
  if (!units.length) return "";
  if (units.length <= limit) return units.join(", ");
  return `${units.slice(0, limit).join(", ")} +${units.length - limit}`;
}

function buildMultiSeriesChartData(series) {
  let excludedCount = 0;
  const rows = series.flatMap((item) => item.rows.map((row) => {
    const hasReferenceRange = row._refMin !== null && row._refMax !== null && row._refMax !== row._refMin;
    const canPlot = row._value !== null && hasReferenceRange;
    if (row._value !== null && !canPlot) excludedCount += 1;
    return {
      ...row,
      _plotValue: canPlot ? (row._value - row._refMin) / (row._refMax - row._refMin) : null,
      _plotRefMin: 0,
      _plotRefMax: 1,
      _plotUnit: "Referenzbereich",
      _plotOriginalUnit: row.Einheit || "",
      _plotConverted: false,
      _plotMode: "relative",
      _rawValueText: `${row.Ergebnis_text || row.Ergebnis} ${row.Einheit || ""}`.trim(),
    };
  }));
  return {
    rows: rows.sort((a, b) => (a._date?.getTime() || 0) - (b._date?.getTime() || 0)),
    targetUnit: "relativer Referenzbereich",
    convertedCount: 0,
    excludedCount,
  };
}

function resetChartZoom() {
  state.chartZoom = null;
  els.chartZoomReset.hidden = true;
}

function mostCommon(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function tableSortValue(row, key) {
  const values = {
    date: row._date?.getTime() || 0,
    value: row._value ?? Number.NEGATIVE_INFINITY,
    name: originalNameText(row),
    unit: row.Einheit,
    reference: row.Referenzbereich,
    status: row.Bewertung,
    lab: row.Labor,
    source: sourceText(row),
    comment: row.Kommentar,
  };
  return values[key] ?? "";
}

function sortTableRows(rows) {
  const { key, direction } = state.tableSort;
  const multiplier = direction === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const av = tableSortValue(a, key);
    const bv = tableSortValue(b, key);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * multiplier;
    return String(av || "").localeCompare(String(bv || ""), "de", { numeric: true, sensitivity: "base" }) * multiplier;
  });
}

function updateSortButtons() {
  for (const button of els.sortButtons) {
    const active = button.dataset.sort === state.tableSort.key;
    button.classList.toggle("active", active);
    button.classList.toggle("desc", active && state.tableSort.direction === "desc");
    button.classList.toggle("asc", active && state.tableSort.direction === "asc");
    const label = button.textContent.trim();
    button.setAttribute("aria-sort", active ? (state.tableSort.direction === "asc" ? "ascending" : "descending") : "none");
    button.setAttribute("title", `${label} sortieren`);
  }
}

function renderTable(rows) {
  els.rowCount.textContent = String(rows.length);
  updateSortButtons();
  els.historyRows.innerHTML = rows.map((row) => `
    <tr data-row-id="${escapeAttr(row._rowId)}" class="${row._rowId === state.selectedRowId ? "selectedRow" : ""}">
      <td>${escapeHtml(row.Datum)}</td>
      <td><strong>${escapeHtml(row.Ergebnis_text || row.Ergebnis)}</strong></td>
      <td>${compactTextCell(originalNameText(row), 4, "Originalname anzeigen")}</td>
      <td>${unitCell(row)}</td>
      <td>${escapeHtml(row.Referenzbereich)}</td>
      <td>${badge(row.Bewertung)}</td>
      <td>${compactTextCell(row.Labor, 3, "Labor anzeigen")}</td>
      <td>${compactTextCell(sourceText(row), 4, "Quelle anzeigen", reportHref(row))}</td>
      <td>${commentCell(row.Kommentar)}</td>
    </tr>
  `).join("");
}

function allValuesGroupMap() {
  return new Map(state.groups.map((group) => [group.key, group]));
}

function allValuesGeneratedData(row, groups = allValuesGroupMap()) {
  const group = groups.get(row._key);
  const href = reportHref(row);
  return {
    Verlaufsgruppe: group?.displayName || row.Standardname || row.Name_im_Bericht || "",
    Suchaliase: (group?.aliases || []).join(", "),
    Messungen_in_Gruppe: group?.rows?.length ? String(group.rows.length) : "1",
    Dokumentlink: href ? new URL(href, window.location.href).href : "",
  };
}

function allValuesCellValue(row, column, groups) {
  if (ALL_VALUES_ORIGINAL_COLUMNS.includes(column)) return row[column] || "";
  return allValuesGeneratedData(row, groups)[column] || "";
}

function allValuesSearchText(row, groups) {
  return normalizeSearchText(ALL_VALUES_EXPORT_COLUMNS.map((column) => allValuesCellValue(row, column, groups)).join(" "));
}

function allValuesFilteredRows() {
  const groups = allValuesGroupMap();
  const query = normalizeSearchText(state.allValuesQuery);
  let rows = state.rows;
  if (query) {
    rows = rows.filter((row) => allValuesSearchText(row, groups).includes(query));
  }
  return sortAllValuesRows(rows, groups);
}

function sortAllValuesRows(rows, groups = allValuesGroupMap()) {
  const sort = state.allValuesSort || "dateDesc";
  return rows.slice().sort((a, b) => {
    if (sort === "dateAsc" || sort === "dateDesc") {
      const av = a._date?.getTime() || 0;
      const bv = b._date?.getTime() || 0;
      return sort === "dateAsc" ? av - bv : bv - av;
    }
    if (sort === "nameAsc" || sort === "nameDesc") {
      const av = allValuesGeneratedData(a, groups).Verlaufsgruppe || a.Standardname || a.Name_im_Bericht || "";
      const bv = allValuesGeneratedData(b, groups).Verlaufsgruppe || b.Standardname || b.Name_im_Bericht || "";
      return av.localeCompare(bv, "de", { numeric: true, sensitivity: "base" }) * (sort === "nameAsc" ? 1 : -1);
    }
    if (sort === "labAsc") {
      return String(a.Labor || "").localeCompare(String(b.Labor || ""), "de", { numeric: true, sensitivity: "base" });
    }
    if (sort === "status") {
      return statusSortRank(a.Bewertung) - statusSortRank(b.Bewertung)
        || String(a.Standardname || a.Name_im_Bericht || "").localeCompare(String(b.Standardname || b.Name_im_Bericht || ""), "de");
    }
    return 0;
  });
}

function statusSortRank(status) {
  const ranks = {
    "erhöht": 0,
    "erniedrigt": 1,
    "grenzwertig": 2,
    "auffällig/positiv": 3,
    "unbewertet": 4,
    "im Referenzbereich": 5,
  };
  return ranks[status || "unbewertet"] ?? 4;
}

function renderAllValues() {
  if (!els.allValuesView || !els.allValuesRows) return;
  const rows = allValuesFilteredRows();
  const visibleRows = rows.slice(0, state.allValuesVisibleLimit);
  const groups = allValuesGroupMap();
  const latest = state.rows.map((row) => row._date).filter(Boolean).sort((a, b) => b - a)[0];
  const first = state.rows.map((row) => row._date).filter(Boolean).sort((a, b) => a - b)[0];
  if (els.allValuesStats) {
    els.allValuesStats.innerHTML = [
      renderTopicStat("Messwerte", state.rows.length.toLocaleString("de-DE"), "gesamt", "blue"),
      renderTopicStat("Anzeige", rows.length.toLocaleString("de-DE"), state.allValuesQuery ? "gefiltert" : "aktuell", "open"),
      renderTopicStat("Gruppen", state.groups.length.toLocaleString("de-DE"), "Verlaufsgruppen", "ok"),
      renderTopicStat("Zeitraum", first && latest ? `${formatShortDate(first)} - ${formatShortDate(latest)}` : "-", "Datenbestand", "blue"),
    ].join("");
  }
  if (els.allValuesCount) {
    els.allValuesCount.textContent = visibleRows.length === rows.length
      ? rows.length.toLocaleString("de-DE")
      : `${visibleRows.length.toLocaleString("de-DE")} / ${rows.length.toLocaleString("de-DE")}`;
  }
  if (els.allValuesMore) {
    els.allValuesMore.hidden = visibleRows.length >= rows.length;
    els.allValuesMore.textContent = `Weitere ${Math.min(300, rows.length - visibleRows.length).toLocaleString("de-DE")} anzeigen`;
  }
  els.allValuesRows.innerHTML = visibleRows.map((row) => {
    const generated = allValuesGeneratedData(row, groups);
    return `
      <tr>
        <td>${escapeHtml(row.Datum)}</td>
        <td>${compactTextCell(row.Labor, 3, "Labor anzeigen")}</td>
        <td>${escapeHtml(row.Dokumentkategorie)}</td>
        <td>${compactTextCell(row.Abschnitt, 4, "Abschnitt anzeigen")}</td>
        <td>${compactTextCell(row.Kategorie, 3, "Kategorie anzeigen")}</td>
        <td>${compactTextCell(row.Name_im_Bericht, 4, "Originalname anzeigen")}</td>
        <td>${compactTextCell(row.Standardname, 4, "Standardname anzeigen")}</td>
        <td><strong>${escapeHtml(row.Ergebnis)}</strong></td>
        <td><strong>${escapeHtml(row.Ergebnis_text)}</strong></td>
        <td>${escapeHtml(row.Qualifikator)}</td>
        <td>${escapeHtml(row.Einheit)}</td>
        <td>${compactTextCell(row.Referenzbereich, 4, "Referenz anzeigen")}</td>
        <td>${escapeHtml(row.Referenz_min)}</td>
        <td>${escapeHtml(row.Referenz_max)}</td>
        <td>${badge(row.Bewertung)}</td>
        <td>${escapeHtml(row.Methode)}</td>
        <td>${compactTextCell(row.Kommentar, 5, "Kommentar anzeigen")}</td>
        <td>${compactTextCell(row.Quelldatei, 4, "Laborbericht öffnen", reportHref(row))}</td>
        <td>${escapeHtml(row.Seite)}</td>
        <td>${compactTextCell(generated.Verlaufsgruppe, 4, "Verlaufsgruppe anzeigen")}</td>
        <td>${compactTextCell(generated.Suchaliase, 4, "Suchaliase anzeigen")}</td>
        <td>${escapeHtml(generated.Messungen_in_Gruppe)}</td>
        <td>${generated.Dokumentlink ? `<a class="compactLink" href="${escapeAttr(reportHref(row))}">öffnen</a>` : ""}</td>
      </tr>
    `;
  }).join("");
}

function allValuesExportRows() {
  const groups = allValuesGroupMap();
  return allValuesFilteredRows().map((row) => {
    const out = {};
    for (const column of ALL_VALUES_EXPORT_COLUMNS) out[column] = allValuesCellValue(row, column, groups);
    return out;
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function timestampForExport() {
  return new Date().toISOString().slice(0, 10);
}

function exportAllValuesCsv() {
  const rows = allValuesExportRows();
  const header = ALL_VALUES_EXPORT_COLUMNS.map(csvEscape).join(",");
  const body = rows.map((row) => ALL_VALUES_EXPORT_COLUMNS.map((column) => csvEscape(row[column])).join(",")).join("\n");
  downloadBlob(`labordaten-alle-werte-${timestampForExport()}.csv`, `\uFEFF${header}\n${body}\n`, "text/csv;charset=utf-8");
}

function exportAllValuesExcel() {
  const rows = allValuesExportRows();
  const table = `
    <table>
      <thead><tr>${ALL_VALUES_EXPORT_COLUMNS.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${ALL_VALUES_EXPORT_COLUMNS.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${table}</body></html>`;
  downloadBlob(`labordaten-alle-werte-${timestampForExport()}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
}

function exportAllValuesPdf() {
  const rows = allValuesExportRows();
  const table = `
    <table>
      <thead><tr>${ALL_VALUES_EXPORT_COLUMNS.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${ALL_VALUES_EXPORT_COLUMNS.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Labordaten alle Werte</title>
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17211c; }
          h1 { font-size: 18px; margin: 0 0 10px; }
          p { margin: 0 0 14px; color: #59655f; }
          table { width: 100%; border-collapse: collapse; font-size: 8px; }
          th, td { border: 1px solid #deddd5; padding: 3px 4px; text-align: left; vertical-align: top; }
          th { background: #dfece4; }
          @page { size: A4 landscape; margin: 10mm; }
        </style>
      </head>
      <body>
        <h1>Labordaten alle Werte</h1>
        <p>${rows.length.toLocaleString("de-DE")} exportierte Messwerte · ${new Date().toLocaleDateString("de-DE")}</p>
        ${table}
      </body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

function unitCell(row) {
  const originalUnit = row.Einheit || "ohne Einheit";
  const plotted = state.chartRows.find((chartRow) => chartRow._rowId === row._rowId);
  let hint = "";
  let hintClass = "unitCellHint";
  if (plotted?._plotMode === "relative") {
    hint = "Grafik: relativ";
  } else if (plotted?._plotConverted) {
    hint = `Grafik: ${formatNumber(plotted._plotValue)} ${plotted._plotUnit}`;
  } else if (plotted && row._value !== null && plotted._plotValue === null && row.Einheit) {
    hint = "nicht gezeichnet";
    hintClass += " warn";
  } else if (plotted?._plotUnit && row.Einheit && canonicalUnit(row.Einheit) !== plotted._plotUnit) {
    hint = `Grafik: ${plotted._plotUnit}`;
  }
  return `
    <span class="unitCell">
      <span>${escapeHtml(originalUnit)}</span>
      ${hint ? `<small class="${hintClass}">${escapeHtml(hint)}</small>` : ""}
    </span>
  `;
}

function commentCell(comment) {
  return compactTextCell(comment, 4, "Kommentar anzeigen");
}

function sourceText(row) {
  return `${row.Quelldatei || ""}${row.Seite ? ` · S. ${row.Seite}` : ""}`.trim();
}

function reportHref(row) {
  if (!row.Quelldatei) return "";
  const page = row.Seite ? `&page=${encodeURIComponent(row.Seite)}` : "";
  return `${reportFileHref(row.Quelldatei)}${page}`;
}

function reportFileHref(file, page = null) {
  const href = documentFileHref(file, "pdf");
  return page ? `${href}&page=${encodeURIComponent(page)}` : href;
}

function documentFileHref(file, collection) {
  return `./report-viewer.html?file=${encodeURIComponent(file)}&collection=${encodeURIComponent(collection || "pdf")}&v=${APP_VERSION}`;
}

function documentPrintHref(file, collection) {
  return `${documentFileHref(file, collection)}&print=1`;
}

function actionIcon(name) {
  if (name === "print") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8V3h10v5"></path>
        <path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"></path>
        <path d="M7 14h10v7H7z"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"></path>
      <path d="M12 16V3"></path>
      <path d="m7 8 5-5 5 5"></path>
    </svg>
  `;
}

function documentActionButtons(file, collection, title) {
  const href = documentFileHref(file, collection);
  const printHref = documentPrintHref(file, collection);
  const safeTitle = title || file;
  return `
    <div class="documentActions">
      <a class="documentActionButton" href="${escapeAttr(printHref)}" aria-label="${escapeAttr(`${safeTitle} drucken`)}" title="Drucken">
        ${actionIcon("print")}
      </a>
      <button class="documentActionButton" type="button" data-share-document data-share-url="${escapeAttr(href)}" data-share-title="${escapeAttr(safeTitle)}" aria-label="${escapeAttr(`${safeTitle} teilen`)}" title="Teilen">
        ${actionIcon("share")}
      </button>
    </div>
  `;
}

function originalNameText(row) {
  const original = row.Name_im_Bericht || "";
  if (!original || original === row.Standardname) return original;
  return `${original} · standardisiert: ${row.Standardname || ""}`;
}

function compactTextCell(value, wordLimit, label, href = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const words = text.split(/\s+/);
  const preview = words.length > wordLimit
    ? words.slice(0, wordLimit).join(" ")
    : `${text.slice(0, 34).trim()}${text.length > 34 ? "" : ""}`;
  const previewHtml = href
    ? `<a class="compactLink" href="${escapeAttr(href)}" title="Laborbericht öffnen">${escapeHtml(preview)}</a>`
    : escapeHtml(preview);
  if (words.length <= wordLimit && text.length <= 34) {
    return href
      ? `<a class="compactLink" href="${escapeAttr(href)}" title="Laborbericht öffnen">${escapeHtml(text)}</a>`
      : escapeHtml(text);
  }
  return `
    <span class="compactWrap">
      <span class="compactPreview">${previewHtml}</span>
      <button class="compactMore" type="button" aria-label="${escapeAttr(label)}">...</button>
      <span class="compactFull" role="tooltip">${escapeHtml(text)}</span>
    </span>
  `;
}

function badge(status) {
  let cls = "unknown";
  if (status === "im Referenzbereich") cls = "ok";
  if (status === "erhöht") cls = "high";
  if (status === "erniedrigt") cls = "low";
  if (status === "grenzwertig") cls = "borderline";
  if (status === "auffällig/positiv") cls = "positive";
  return `<span class="badge ${cls}">${escapeHtml(status || "unbewertet")}</span>`;
}

function drawChart(rows) {
  if (state.chartCollapsed) {
    state.chartPoints = [];
    return;
  }
  const canvas = els.chart;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssHeight = window.innerWidth <= 520 ? 300 : window.innerWidth <= 760 ? 330 : 380;
  canvas.width = Math.max(window.innerWidth <= 640 ? 620 : 900, Math.floor(rect.width * dpr));
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.scale(dpr, dpr);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.clearRect(0, 0, width, height);
  state.chartPoints = [];

  const fullNumeric = rows.filter((r) => r._date && r._plotValue !== null && r._plotValue !== undefined);
  if (!fullNumeric.length) {
    ctx.fillStyle = "#69736d";
    ctx.font = "14px Segoe UI, Arial";
    ctx.fillText("Keine numerischen Werte für die Verlaufsgrafik.", 24, 42);
    els.chartLegend.innerHTML = "";
    return;
  }

  const pad = { left: 58, right: 22, top: 24, bottom: 46 };
  const fullTimes = fullNumeric.map((r) => r._date.getTime());
  const fullMinT = Math.min(...fullTimes);
  const fullMaxT = Math.max(...fullTimes);
  if (state.chartZoom && (state.chartZoom.min < fullMinT || state.chartZoom.max > fullMaxT || state.chartZoom.min >= state.chartZoom.max)) {
    resetChartZoom();
  }
  const zoomMinT = state.chartZoom?.min ?? fullMinT;
  const zoomMaxT = state.chartZoom?.max ?? fullMaxT;
  const numeric = fullNumeric.filter((r) => {
    const t = r._date.getTime();
    return t >= zoomMinT && t <= zoomMaxT;
  });
  const lineNumeric = rowsForVisibleLines(fullNumeric, zoomMinT, zoomMaxT);
  if (!numeric.length && !lineNumeric.length) {
    ctx.fillStyle = "#69736d";
    ctx.font = "14px Segoe UI, Arial";
    ctx.fillText("Keine Messpunkte im aktuellen Zoomausschnitt.", 24, 42);
    els.chartLegend.innerHTML = [
      `<span>Zoom aktiv: ${formatShortDate(new Date(zoomMinT))} - ${formatShortDate(new Date(zoomMaxT))}</span>`,
      `<span>Mausrad/Touchpad zum Zoomen, Button zum Zurücksetzen</span>`,
    ].join("");
    return;
  }
  const domainRows = numeric.length ? numeric : lineNumeric;
  const vals = domainRows.map((r) => r._plotValue);
  const refMins = domainRows.map((r) => r._plotRefMin).filter((v) => v !== null);
  const refMaxs = domainRows.map((r) => r._plotRefMax).filter((v) => v !== null);
  const seriesItems = chartSeriesItems(lineNumeric.length ? lineNumeric : numeric);
  const isMultiSeries = seriesItems.length > 1;
  const isRelativeChart = domainRows.some((row) => row._plotMode === "relative");
  const minT = zoomMinT;
  const maxT = zoomMaxT;
  let minY = Math.min(...vals, ...refMins);
  let maxY = Math.max(...vals, ...refMaxs);
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  const yPad = (maxY - minY) * 0.12;
  minY -= yPad;
  maxY += yPad;

  const x = (t) => pad.left + ((t - minT) / Math.max(1, maxT - minT)) * (width - pad.left - pad.right);
  const y = (v) => pad.top + (1 - (v - minY) / (maxY - minY)) * (height - pad.top - pad.bottom);

  ctx.strokeStyle = "#deddd5";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  ctx.fillStyle = "#69736d";
  ctx.font = "12px Segoe UI, Arial";
  for (let i = 0; i <= 4; i += 1) {
    const value = minY + ((maxY - minY) * i) / 4;
    const yy = y(value);
    ctx.strokeStyle = "#ebe9e2";
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(width - pad.right, yy);
    ctx.stroke();
    ctx.fillText(formatAxisNumber(value, isRelativeChart), 8, yy + 4);
  }

  const firstRefMin = mostStableNumber(domainRows.map((r) => r._plotRefMin));
  const firstRefMax = mostStableNumber(domainRows.map((r) => r._plotRefMax));
  if (firstRefMin !== null || firstRefMax !== null) {
    ctx.fillStyle = "rgba(183, 210, 195, 0.28)";
    const top = firstRefMax !== null ? y(firstRefMax) : pad.top;
    const bottom = firstRefMin !== null ? y(firstRefMin) : height - pad.bottom;
    ctx.fillRect(pad.left, top, width - pad.left - pad.right, Math.max(1, bottom - top));
    ctx.strokeStyle = "rgba(35, 100, 81, 0.58)";
    ctx.setLineDash([4, 4]);
    if (firstRefMin !== null) {
      ctx.beginPath(); ctx.moveTo(pad.left, y(firstRefMin)); ctx.lineTo(width - pad.right, y(firstRefMin)); ctx.stroke();
    }
    if (firstRefMax !== null) {
      ctx.beginPath(); ctx.moveTo(pad.left, y(firstRefMax)); ctx.lineTo(width - pad.right, y(firstRefMax)); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, width - pad.left - pad.right, height - pad.top - pad.bottom);
  ctx.clip();
  for (const item of seriesItems) {
    const seriesRows = fullNumeric
      .filter((row) => (row._seriesKey || "single") === item.key)
      .sort((a, b) => a._date - b._date);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = isMultiSeries ? 2.4 : 2;
    ctx.beginPath();
    seriesRows.forEach((row, i) => {
      const xx = x(row._date.getTime());
      const yy = y(row._plotValue);
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    });
    ctx.stroke();
  }
  ctx.restore();

  for (const row of numeric) {
    const color = isMultiSeries && row._seriesColor
      ? row._seriesColor
      : row.Bewertung === "erhöht" || row.Bewertung === "auffällig/positiv"
      ? "#b43b46"
      : row.Bewertung === "erniedrigt" || row.Bewertung === "grenzwertig"
        ? "#a36f18"
        : "#174c3c";
    const xx = x(row._date.getTime());
    const yy = y(row._plotValue);
    const hovered = row._rowId === state.hoveredPointId;
    const selected = row._rowId === state.selectedRowId;
    ctx.fillStyle = color;
    if (hovered || selected) {
      ctx.strokeStyle = "rgba(15, 23, 42, 0.22)";
      ctx.lineWidth = hovered ? 8 : 6;
      ctx.beginPath();
      ctx.arc(xx, yy, hovered ? 7 : 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(xx, yy, hovered ? 6 : selected ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();
    state.chartPoints.push({ row, x: xx, y: yy, radius: hovered ? 11 : 9 });
  }

  ctx.fillStyle = "#69736d";
  const start = new Date(minT).getFullYear();
  const end = new Date(maxT).getFullYear();
  ctx.fillText(String(start), pad.left, height - 18);
  ctx.fillText(String(end), width - pad.right - 34, height - 18);
  if (isMultiSeries) {
    renderMultiSeriesLegend({ seriesItems, zoomMinT, zoomMaxT });
  } else {
    renderChartLegend({ refMin: firstRefMin, refMax: firstRefMax, unit: domainRows[0]?._plotUnit || "", zoomMinT, zoomMaxT });
  }
}

function rowsForVisibleLines(rows, minT, maxT) {
  const bySeries = new Map();
  for (const row of rows) {
    const key = row._seriesKey || "single";
    if (!bySeries.has(key)) bySeries.set(key, []);
    bySeries.get(key).push(row);
  }
  const keep = new Set();
  for (const seriesRows of bySeries.values()) {
    const sorted = [...seriesRows].sort((a, b) => a._date - b._date);
    for (let i = 0; i < sorted.length; i += 1) {
      const row = sorted[i];
      const t = row._date.getTime();
      if (t >= minT && t <= maxT) keep.add(row);
      const next = sorted[i + 1];
      if (!next) continue;
      const nextT = next._date.getTime();
      if (t <= maxT && nextT >= minT) {
        keep.add(row);
        keep.add(next);
      }
    }
  }
  return [...keep];
}

function chartSeriesItems(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row._seriesKey || "single";
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: row._seriesName || els.selectedName.textContent || "Messwert",
        color: row._seriesColor || "#174c3c",
      });
    }
  }
  return [...map.values()];
}

function renderChartLegend({ refMin, refMax, unit, zoomMinT, zoomMaxT }) {
  const refText = referenceLegendText(refMin, refMax, unit);
  const zoomText = state.chartZoom ? `${formatShortDate(new Date(zoomMinT))} - ${formatShortDate(new Date(zoomMaxT))}` : "";
  const unitDetails = chartUnitLegendDetails();
  els.chartLegend.innerHTML = `
    <div class="referenceLegend">
      <span class="referenceSwatch" aria-hidden="true"></span>
      <div>
        <strong>Referenzbereich</strong>
        <span>${escapeHtml(refText)}</span>
      </div>
    </div>
    ${unitDetails}
    ${zoomText ? `<div class="zoomLegend">Zoom ${escapeHtml(zoomText)}</div>` : ""}
  `;
}

function chartUnitLegendDetails() {
  const rows = state.chartRows || [];
  const convertedRows = rows.filter((row) => row._plotConverted);
  const excludedRows = rows.filter((row) => row._value !== null && row._plotValue === null && row.Einheit);
  const details = [];
  if (convertedRows.length) {
    const fromUnits = unitList(convertedRows.map((row) => row._plotOriginalUnit || row.Einheit).filter(Boolean), 5);
    const targetUnit = convertedRows[0]._plotUnit || "";
    details.push(`Umgerechnet: ${fromUnits}${targetUnit ? ` -> ${targetUnit}` : ""}`);
  }
  if (excludedRows.length) {
    const excludedUnits = unitList(excludedRows.map((row) => row.Einheit).filter(Boolean), 5);
    details.push(`Nicht gezeichnet: ${excludedUnits}`);
  }
  if (!details.length) return "";
  return `<div class="unitLegend">${details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join("")}<span>Tabelle: Originaleinheiten</span></div>`;
}

function renderMultiSeriesLegend({ seriesItems, zoomMinT, zoomMaxT }) {
  const zoomText = state.chartZoom ? `${formatShortDate(new Date(zoomMinT))} - ${formatShortDate(new Date(zoomMaxT))}` : "";
  const seriesHtml = seriesItems.map((item) => `
    <span class="seriesLegendItem">
      <i style="background:${escapeAttr(item.color)}"></i>
      ${escapeHtml(item.name)}
    </span>
  `).join("");
  els.chartLegend.innerHTML = `
    <div class="referenceLegend">
      <span class="referenceSwatch" aria-hidden="true"></span>
      <div>
        <strong>Referenzbereich</strong>
        <span>0 - 100% je Messwert</span>
      </div>
    </div>
    <div class="seriesLegend">${seriesHtml}</div>
    <div class="unitLegend"><span>Vergleichsansicht: Y-Achse relativ zum jeweiligen Referenzbereich</span><span>Tabelle: Originaleinheiten</span></div>
    ${zoomText ? `<div class="zoomLegend">Zoom ${escapeHtml(zoomText)}</div>` : ""}
  `;
}

function referenceLegendText(refMin, refMax, unit) {
  const suffix = unit ? ` ${unit}` : "";
  if (refMin !== null && refMax !== null) return `${formatNumber(refMin)} - ${formatNumber(refMax)}${suffix}`;
  if (refMin !== null) return `ab ${formatNumber(refMin)}${suffix}`;
  if (refMax !== null) return `bis ${formatNumber(refMax)}${suffix}`;
  return "nicht numerisch hinterlegt";
}

function mostStableNumber(values) {
  const nums = values.filter((v) => v !== null);
  if (!nums.length) return null;
  const counts = new Map();
  for (const n of nums) counts.set(n, (counts.get(n) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function formatNumber(value) {
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatAxisNumber(value, asPercent = false) {
  return asPercent ? `${formatNumber(value * 100)}%` : formatNumber(value);
}

function chartEventPoint(event) {
  const rect = els.chart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let nearest = null;
  let nearestDistance = Infinity;
  for (const point of state.chartPoints) {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance <= point.radius && distance < nearestDistance) {
      nearest = point;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function showChartTooltip(point, event) {
  if (!point) {
    els.chartTooltip.hidden = true;
    return;
  }
  const row = point.row;
  const value = row._plotMode === "relative"
    ? `${formatNumber(row._plotValue * 100)}% im Referenzbereich · ${row._rawValueText || ""}`.trim()
    : row._plotValue !== null && row._plotValue !== undefined
    ? `${formatNumber(row._plotValue)} ${row._plotUnit || ""}`.trim()
    : `${row.Ergebnis_text || row.Ergebnis} ${row.Einheit || ""}`.trim();
  els.chartTooltip.innerHTML = `
    <strong>${escapeHtml(row._seriesName || row.Datum)}</strong>
    ${row._seriesName ? `<span>${escapeHtml(row.Datum)}</span>` : ""}
    <span>${escapeHtml(row.Labor)}</span>
    <span>${escapeHtml(value)}</span>
  `;
  const panelRect = els.chart.parentElement.getBoundingClientRect();
  els.chartTooltip.style.left = `${Math.min(event.clientX - panelRect.left + 12, panelRect.width - 190)}px`;
  els.chartTooltip.style.top = `${Math.max(event.clientY - panelRect.top - 18, 8)}px`;
  els.chartTooltip.hidden = false;
}

function fullChartTimeDomain() {
  const numeric = state.chartRows.filter((r) => r._date && r._plotValue !== null && r._plotValue !== undefined);
  if (numeric.length < 2) return null;
  const times = numeric.map((r) => r._date.getTime());
  return { min: Math.min(...times), max: Math.max(...times) };
}

function zoomChartAt(event) {
  if (state.chartCollapsed) return;
  const domain = fullChartTimeDomain();
  if (!domain || domain.max <= domain.min) return;
  event.preventDefault();

  const rect = els.chart.getBoundingClientRect();
  const pad = { left: 58, right: 22 };
  const plotLeft = pad.left;
  const plotRight = rect.width - pad.right;
  const x = Math.min(plotRight, Math.max(plotLeft, event.clientX - rect.left));
  const ratio = (x - plotLeft) / Math.max(1, plotRight - plotLeft);
  const current = state.chartZoom || domain;
  const currentSpan = current.max - current.min;
  const factor = event.deltaY < 0 ? 0.945 : 1.06;
  const minSpan = 86400000;
  let nextSpan = Math.max(minSpan, Math.min(domain.max - domain.min, currentSpan * factor));
  const anchor = current.min + currentSpan * ratio;
  let nextMin = anchor - nextSpan * ratio;
  let nextMax = nextMin + nextSpan;

  if (nextMin < domain.min) {
    nextMin = domain.min;
    nextMax = nextMin + nextSpan;
  }
  if (nextMax > domain.max) {
    nextMax = domain.max;
    nextMin = nextMax - nextSpan;
  }
  if (nextSpan >= (domain.max - domain.min) * 0.995) {
    resetChartZoom();
  } else {
    state.chartZoom = { min: nextMin, max: nextMax };
    els.chartZoomReset.hidden = false;
  }
  drawChart(state.chartRows);
}

function selectHistoryRow(rowId, options = {}) {
  state.selectedRowId = rowId;
  for (const rowEl of els.historyRows.querySelectorAll("tr")) {
    rowEl.classList.toggle("selectedRow", rowEl.dataset.rowId === rowId);
  }
  const target = els.historyRows.querySelector(`tr[data-row-id="${rowId}"]`);
  if (target && options.scroll !== false) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  drawChart(state.chartRows);
}

function setPanelCollapsed(panel, collapsed) {
  if (panel === "chart") {
    state.chartCollapsed = collapsed;
    els.chartPanel.classList.toggle("collapsed", collapsed);
    els.chartToggle.setAttribute("aria-expanded", String(!collapsed));
    els.chartToggle.setAttribute("aria-label", collapsed ? "Verlauf ausklappen" : "Verlauf einklappen");
    els.chartToggle.setAttribute("title", collapsed ? "Verlauf ausklappen" : "Verlauf einklappen");
    els.chartTooltip.hidden = true;
    if (!collapsed) drawChart(state.chartRows);
    return;
  }
  state.tableCollapsed = collapsed;
  els.tablePanel.classList.toggle("collapsed", collapsed);
  els.tableToggle.setAttribute("aria-expanded", String(!collapsed));
  els.tableToggle.setAttribute("aria-label", collapsed ? "Messwert-Historie ausklappen" : "Messwert-Historie einklappen");
  els.tableToggle.setAttribute("title", collapsed ? "Messwert-Historie ausklappen" : "Messwert-Historie einklappen");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function labSheetFromHash(hash) {
  if (hash === "werte" || hash === "messwerte" || hash === "alle-werte" || hash === "allewerte" || hash === "blutwerte-liste") return "values";
  if (hash === "start" || hash === "labordaten" || hash === "labor") return "labor";
  return "";
}

function viewFromHash() {
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, "")).toLowerCase();
  if (!hash || hash === "home" || hash === "uebersicht" || hash === "übersicht" || hash === "gesundheitsdaten") return "home";
  const labSheet = labSheetFromHash(hash);
  if (labSheet) {
    state.activeLabSheet = labSheet;
    return "start";
  }
  if (hash === "alter" || hash === "biologisches-alter" || hash === "bioalter" || hash === "phenoage") return "alter";
  if (hash === "berichte" || hash === "laborberichte") return "berichte";
  if (hash === "allergie" || hash === "allergien" || hash === "unvertraeglichkeiten" || hash === "unverträglichkeiten") return "allergien";
  if (MODULE_CONFIGS[hash]) return hash;
  return TOPIC_CONFIGS[hash] ? hash : "home";
}

function revealActiveViewTab(nextView, behavior = "auto") {
  const activeTab = els.viewTabs.find((tab) => tab.dataset.view === nextView);
  const tabList = activeTab?.parentElement;
  if (!activeTab || !tabList) return;

  requestAnimationFrame(() => {
    if (tabList.scrollWidth <= tabList.clientWidth + 1) return;
    const targetLeft = activeTab.offsetLeft - ((tabList.clientWidth - activeTab.offsetWidth) / 2);
    const maxLeft = Math.max(0, tabList.scrollWidth - tabList.clientWidth);
    tabList.scrollTo({
      left: Math.max(0, Math.min(targetLeft, maxLeft)),
      behavior,
    });
  });
}

function setActiveView(view, options = {}) {
  if (view === "werte") {
    state.activeLabSheet = "values";
    view = "start";
  } else if (view === "start" && options.preserveLabSheet !== true && options.updateHash !== false) {
    state.activeLabSheet = "labor";
  }
  const nextView = view === "home" || view === "start" || view === "alter" || view === "berichte" || MODULE_CONFIGS[view] || TOPIC_CONFIGS[view] ? view : "home";
  state.activeView = nextView === "home"
    ? "home"
    : nextView === "start"
    ? "start"
    : nextView === "alter"
    ? "age"
    : nextView === "berichte"
    ? "reports"
    : MODULE_CONFIGS[nextView]
    ? "module"
    : "topic";
  if (TOPIC_CONFIGS[nextView]) state.activeTopic = nextView;

  document.body.classList.toggle("view-home", nextView === "home");
  els.landingView.hidden = nextView !== "home";
  els.labSheetHero.hidden = nextView !== "start";
  els.allValuesView.hidden = nextView !== "start" || state.activeLabSheet !== "values";
  els.ageView.hidden = nextView !== "alter";
  els.explorerView.hidden = nextView !== "start" || state.activeLabSheet !== "labor";
  els.topicView.hidden = !TOPIC_CONFIGS[nextView];
  els.reportsView.hidden = nextView !== "berichte";
  els.moduleView.hidden = !MODULE_CONFIGS[nextView];
  for (const tab of els.viewTabs) {
    tab.classList.toggle("active", tab.dataset.view === nextView);
    tab.setAttribute("aria-current", tab.dataset.view === nextView ? "page" : "false");
  }
  revealActiveViewTab(nextView, options.updateHash === false ? "auto" : "smooth");
  for (const button of els.labSheetButtons) {
    const active = button.dataset.labSheet === state.activeLabSheet;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  els.sourceCount.classList.toggle("active", nextView === "berichte");
  els.sourceCount.setAttribute("aria-current", nextView === "berichte" ? "page" : "false");

  if (options.updateHash !== false) {
    const nextHash = nextView === "start" && state.activeLabSheet === "values" ? "#werte" : `#${nextView}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
    }
  }

  if (nextView === "start" && state.activeLabSheet === "labor") {
    requestAnimationFrame(() => drawChart(state.chartRows));
  } else if (nextView === "start" && state.activeLabSheet === "values") {
    renderAllValues();
  } else if (nextView === "alter") {
    renderBioAge();
  } else if (nextView === "berichte") {
    renderReports();
  } else if (MODULE_CONFIGS[nextView]) {
    renderModule(nextView);
  } else if (nextView === "home") {
    renderLanding();
  } else {
    renderTopic();
  }
}

function renderLanding() {
  if (!els.landingValueCount || !els.landingReportCount) return;
  els.landingValueCount.textContent = state.rows.length.toLocaleString("de-DE");
  els.landingReportCount.textContent = unique(state.rows.map((r) => r.Quelldatei)).length.toLocaleString("de-DE");
}

function setLabSheet(sheet) {
  state.activeLabSheet = sheet === "values" ? "values" : "labor";
  setActiveView("start", { preserveLabSheet: true });
}

function renderModule(view) {
  const config = MODULE_CONFIGS[view];
  if (!config) return;
  const docs = state.documents
    .filter((doc) => doc.type === config.documentType)
    .sort((a, b) => b._time - a._time || String(a.title).localeCompare(String(b.title), "de"));
  const categories = unique(docs.map((doc) => doc.category || "Weitere Befunde"));

  els.moduleEyebrow.textContent = docs.length ? "Dokumente" : config.label;
  els.moduleTitle.textContent = config.title;
  els.moduleSubtitle.textContent = config.subtitle;
  els.moduleStatus.textContent = docs.length ? `${docs.length.toLocaleString("de-DE")} Dokument${docs.length === 1 ? "" : "e"}` : config.emptyStatus;
  els.modulePlaceholderTitle.textContent = docs.length ? "Hinterlegte Dokumente" : config.placeholderTitle;
  els.modulePlaceholderText.textContent = docs.length
    ? "Direkt aus dem Befunde-Hauptordner übernommen, sauber benannt und nach Kategorie gruppiert."
    : config.placeholderText;
  els.moduleStats.innerHTML = docs.length ? `
    <div class="topicStat">
      <span>Dokumente</span>
      <strong>${docs.length.toLocaleString("de-DE")}</strong>
      <small>im Bereich</small>
    </div>
    <div class="topicStat ok">
      <span>Kategorien</span>
      <strong>${categories.length.toLocaleString("de-DE")}</strong>
      <small>gruppiert</small>
    </div>
  ` : "";
  els.moduleSummary.innerHTML = docs.length ? `
    <span>${escapeHtml(categories.join(" · "))}</span>
  ` : "";
  els.moduleDocumentList.innerHTML = docs.length ? renderDocumentGroups(docs, categories) : "";
}

function renderDocumentGroups(docs, categories) {
  return categories.map((category) => {
    const categoryDocs = docs.filter((doc) => (doc.category || "Weitere Befunde") === category);
    return `
      <section class="documentGroup">
        <div class="documentGroupHeader">
          <h4>${escapeHtml(category)}</h4>
          <span>${categoryDocs.length.toLocaleString("de-DE")}</span>
        </div>
        <div class="documentCards">
          ${categoryDocs.map(renderDocumentCard).join("")}
        </div>
      </section>
    `;
  }).join("");
}

function renderDocumentCard(doc) {
  const date = doc._date ? formatDate(doc._date) : doc.date || "ohne Datum";
  const pages = doc.pages ? `${doc.pages} S.` : "PDF";
  const href = documentFileHref(doc.file, doc.collection);
  return `
    <article class="documentCard">
      <a class="documentCardMain" href="${escapeAttr(href)}">
        <strong>${escapeHtml(doc.title || doc.file)}</strong>
        <span>${escapeHtml(date)} · ${escapeHtml(pages)}</span>
        <p>${escapeHtml(doc.summary || doc.originalFile || "")}</p>
      </a>
      ${documentActionButtons(doc.file, doc.collection, doc.title || doc.file)}
    </article>
  `;
}

async function shareDocumentFromOverview(button) {
  const rawUrl = button.dataset.shareUrl || "";
  if (!rawUrl) return;
  const title = button.dataset.shareTitle || "Dokument";
  const url = new URL(rawUrl, window.location.href).href;
  const text = "Dokument aus dem Gesundheitsdaten-Dashboard";
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
  } catch (error) {
    if (error?.name === "AbortError") return;
  }
  const subject = `Dokument: ${title}`;
  const body = `Hier ist der Link zum Dokument:\n${url}`;
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function isAbnormal(row) {
  return ["erhöht", "erniedrigt", "grenzwertig", "auffällig/positiv"].includes(row.Bewertung);
}

function isOk(row) {
  return row.Bewertung === "im Referenzbereich";
}

function isOpen(row) {
  const status = normalizeText(row.Bewertung);
  const qaText = normalizeText(`${row.QA_Status} ${row.Kommentar}`);
  return !status || status === "unbewertet" || /prufen|pruefen|kontrolle|manuell|unsicher|ocr/.test(qaText);
}

function isHematologyRow(row) {
  const name = normalizeText(`${row.Name_im_Bericht} ${row.Standardname}`);
  const category = normalizeText(row.Kategorie);
  const context = normalizeText(`${row.Abschnitt} ${row.Kategorie} ${row.Dokumentkategorie}`);
  const lymphocyteSubset = /\b(cd3|cd4|cd8|cd19|cd16|cd56|cd57|hla dr|treg|nkt zell|nk zell|b lymphozyten gesamt|t lymphozyten gesamt)\b/.test(name);
  const bloodCountCategory = /\b(blutbild|hamatologie|haematologie|differentialblutbild|edta blut|lymphozytendifferenzierung|lymphozytensubpopulation)\b/.test(context);
  const redCells = /\b(erythrozyt|hamoglobin|haemoglobin|hämoglobin|hamatokrit|haematokrit|hämatokrit|mcv|mchc|mch|rdw|evb|retikulozyt|hypochrome)\b/.test(name);
  const platelets = /\b(thrombozyt|mpv|pct|pdw)\b/.test(name);
  const whiteDifferential = /\b(leukozyt|lymphozyt|neutrophil|monozyt|eosinophil|basophil|granulozyt|luc|stabkernige|segmentkernige)\b/.test(name);
  const coagulation = /\b(inr|quick|ptt|fibrinogen|d dimer|thrombinzeit)\b/.test(name) || category.includes("gerinnung");
  return !lymphocyteSubset && (bloodCountCategory || redCells || platelets || whiteDifferential || coagulation);
}

function isAutoAntibodyRow(row) {
  const name = normalizeText(`${row.Name_im_Bericht} ${row.Standardname}`);
  const category = normalizeText(row.Kategorie);
  const exactAutoCategory = category === "autoantikorper immunologie" || category === "autoantikoerper immunologie";
  const excludedReceptor = /m2 pk|pyruvatkinase|interleukin|sil 2|transferrin|tshbasal/.test(name);
  const receptorMarker = /\b(aak|adrenerg|muskarin|cholinerg|achr|angiotensin|endothelin|at1|etar|mas|ace2|nociceptin|glp1|fgf receptor|tshds|cxcr3|rezeptor|receptor)\b/.test(name) && !excludedReceptor;
  const classicMarker = /\b(ana|ena|ds dna|dsdna|anca|ama|mitochondr|cardiolipin|phospholipid|beta 2 glykoprotein|glykoprotein ig|gliadin|transglutaminase|ccp|citrull|intrinsic|parietalzell)\b/.test(name);
  const explicitAntibody = /\b(autoantikorp|autoantikoerper|antibod|antikorper|antikoerper)\b/.test(name)
    && /\b(auto|rezeptor|receptor|adrenerg|muskarin|cholinerg|gangliosid|glykoprotein|phospholipid|cardiolipin|gliadin|dna|ana|ena|anca|ama)\b/.test(name);
  return exactAutoCategory || receptorMarker || classicMarker || explicitAntibody;
}

function isMicrobiomeRow(row) {
  const text = normalizeText([
    row.Dokumentkategorie,
    row.Abschnitt,
    row.Kategorie,
    row.Name_im_Bericht,
    row.Standardname,
    row.Methode,
    row.Kommentar,
    row.Quelldatei,
  ].join(" "));
  const category = normalizeText(row.Kategorie);
  const documentCategory = normalizeText(row.Dokumentkategorie);
  return category.includes("mikrobiom")
    || documentCategory.includes("mikrobiom")
    || documentCategory.includes("stuhl")
    || documentCategory.includes("parasiten")
    || documentCategory.includes("helicobacter pylori")
    || documentCategory.includes("darmbarriere")
    || /\b(calprotectin|zonulin|i fabp|ifabp|pankreaselastase|stuhlfett|siga|secretorisches|alpha 1 antitrypsin|lactoferrin|akkermansia|faecalibacterium|roseburia|butyrat|bifido|lactobacillus|enterococcus|candida|blastocystis|giardia|shannon|diversitat|diversitaet|mukosa|mucin)\b/.test(text);
}

function isImmunologyRow(row) {
  const name = normalizeText(`${row.Name_im_Bericht} ${row.Standardname}`);
  const context = normalizeText(`${row.Abschnitt} ${row.Kategorie} ${row.Dokumentkategorie} ${row.Methode}`);
  const lymphocyteSubsets = /\b(nk zell|nkt zell|t zell|b zell|cd3|cd4|cd8|cd19|cd16|cd56|cd57|hla dr|treg|plasmablast|memoryb|gedachtnis|transitionale)\b/.test(name);
  const humoral = /\b(immunglobulin|ig g|ig a|ig m|ig e|igg|iga|igm|ige|komplement|c3|c4)\b/.test(name);
  const inflammation = /\b(crp|bks|blutsenkung|interleukin|il 1|il 2|il 4|il 6|il 8|il 10|tnf|ifn|interferon|zytokin|cytokin|rantes|vegf|histamin|tryptase|neopterin|s il 2|sil 2)\b/.test(name);
  const functionMarkers = /\b(atp|hla|pneumokokken|tetanus|sars|spike|nukleokapsid|antikorp|antikoerper)\b/.test(name);
  const specificDocument = /\b(immunwerte atp|interleukine atp|hla typisierung|blutwerte immunologie)\b/.test(context);
  return !isAutoAntibodyRow(row) && (lymphocyteSubsets || humoral || inflammation || functionMarkers || specificDocument);
}

function isOrganRow(row) {
  const name = normalizeText(`${row.Name_im_Bericht} ${row.Standardname}`);
  const category = normalizeText(row.Kategorie);
  const context = normalizeText(`${row.Abschnitt} ${row.Kategorie}`);
  const organCategory = /\b(niere elektrolyte|leber enzyme|leber galle|pankreasenzyme|bauchspeicheldruse|herzmarker|muskelenzyme|niere urin|niere stoffwechsel|elektrolyte|elektrolyte urin|stoffwechsel urin|urin organische sauren|stoffwechsel proteine|proteine eiweisselektrophorese|eiweisselektrophorese)\b/.test(category);
  const liver = /\b(gpt|alt|got|ast|ggt|gamma gt|alkalische phosphatase|bilirubin|cholinesterase|gldh)\b/.test(name);
  const kidney = /\b(kreatinin|creatinin|cystatin|egfr|gfr|harnstoff|harnsaure|urea)\b/.test(name);
  const electrolytes = /\b(natrium|kalium|chlorid|calcium|kalzium|magnesium|phosphat|osmolalitat)\b/.test(name) && !/erythrozyten|leukozyten|thrombozyten/.test(name);
  const pancreas = /\b(lipase|amylase|pankreas|elastase)\b/.test(name);
  const heartMuscle = /\b(ck|creatinkinase|troponin|nt probnp|probnp|myoglobin|ldh)\b/.test(name);
  const proteins = /\b(albumin|gesamtprotein|gesamteiweiss|eiweiss|alpha 1 globulin|alpha 2 globulin|beta globulin|gamma globulin)\b/.test(name)
    && /protein|eiweiss|albumin|globulin/.test(`${context} ${name}`);
  return organCategory || liver || kidney || electrolytes || pancreas || heartMuscle || proteins;
}

function isMetabolismRow(row) {
  const name = normalizeText(`${row.Name_im_Bericht} ${row.Standardname}`);
  const category = normalizeText(row.Kategorie);
  const context = normalizeText(`${row.Abschnitt} ${row.Kategorie} ${row.Dokumentkategorie} ${row.Kommentar}`);
  const vitamins = /\b(vitamin|25 oh|calcidiol|calcitriol|folsaure|folat|b12|cobalamin|holo tc|holotranscobalamin|b1|thiamin|b2|riboflavin|b6|pyridoxin|biotin)\b/.test(name);
  const iron = /\b(ferritin|eisen|transferrin|transferrinsattigung|transferrin rezeptor|sTfR|haemochromatose|hamochromatose)\b/i.test(`${row.Name_im_Bericht} ${row.Standardname}`);
  const traceElements = /\b(zink|kupfer|selen|jod|iod|mangan|chrom|molybdan|molybdaen|coenzym q10)\b/.test(name);
  const methylation = /\b(homocystein|methylmalon|mma|folsaure|folat)\b/.test(name);
  const energy = /\b(glukose|glucose|hba1c|insulin|c peptid|laktat|pyruvat|pyrrol|kryptopyrrol|hpl)\b/.test(name);
  const lipids = /\b(cholesterin|hdl|ldl|triglycerid|lipoprotein|apolipoprotein)\b/.test(name);
  const organicAcids = /\b(organische sauren|organische saeure|methylmalonsaure|methylmalonsaeure|zitrat|citrat)\b/.test(context);
  const metabolicCategory = /\b(vitamine|mikronahrstoff|mikronaehrstoff|spurenelement|eisenstoffwechsel|stoffwechsel|lipide|urin organische sauren)\b/.test(category);
  return vitamins || iron || traceElements || methylation || energy || lipids || organicAcids || metabolicCategory;
}

function topicBucket(row, topicKey) {
  const text = normalizeText(`${row.Dokumentkategorie} ${row.Abschnitt} ${row.Kategorie} ${row.Name_im_Bericht} ${row.Standardname}`);
  if (topicKey === "haematologie") {
    if (/\b(erythrozyt|hamoglobin|haemoglobin|hamatokrit|haematokrit|mcv|mchc|mch|rdw|evb|retikulozyt|hypochrome)\b/.test(text)) return "Rote Blutreihe";
    if (/\b(thrombozyt|mpv|pct|pdw)\b/.test(text)) return "Thrombozyten";
    if (/\b(leukozyt|neutrophil|lymphozyt|monozyt|eosinophil|basophil|granulozyt|luc|stabkernige|segmentkernige)\b/.test(text)) return "Weiße Blutreihe";
    if (/\b(inr|quick|ptt|fibrinogen|d dimer|thrombinzeit|gerinnung)\b/.test(text)) return "Gerinnung";
    return "Weitere Hämatologie";
  }
  if (topicKey === "autoantikoerper") {
    if (/\b(aak|adrenerg|muskarin|cholinerg|angiotensin|endothelin|at1|at1r|etar|mas|ace2|nociceptin|glp1|fgf receptor|tshds|cxcr3|rezeptor|receptor)\b/.test(text)) return "GPCR / Rezeptor-AAK";
    if (/\b(ana|ena|ds dna|dsdna|anca|ama|mitochondr|cardiolipin|phospholipid|glykoprotein|gliadin|transglutaminase|ccp|citrull)\b/.test(text)) return "Klassische Autoimmunität";
    return "Weitere Autoantikörper";
  }
  if (topicKey === "immunologie") {
    if (/\b(nk zell|nkt zell|t zell|b zell|cd3|cd4|cd8|cd19|cd16|cd56|cd57|hla dr|treg|plasmablast|memoryb|gedachtnis|transitionale)\b/.test(text)) return "Lymphozyten-Subsets";
    if (/leukozyt|lymphozyt|neutrophil|monozyt|eosinophil|basophil|granulozyt/.test(text)) return "Blutbild & Differential";
    if (/\b(immunglobulin|ig g|ig a|ig m|ig e|igg|iga|igm|ige|komplement|c3|c4)\b/.test(text)) return "Humorale Immunität";
    if (/\b(interleukin|il 1|il 2|il 4|il 6|il 8|il 10|tnf|ifn|interferon|zytokin|cytokin|rantes|vegf|s il 2|sil 2)\b/.test(text)) return "Zytokine & Signalmarker";
    if (/\b(crp|bks|blutsenkung|histamin|tryptase|neopterin)\b/.test(text)) return "Entzündung & Mastzellmarker";
    if (/\b(atp|hla|pneumokokken|tetanus|sars|spike|nukleokapsid|antikorp|antikoerper)\b/.test(text)) return "Immunfunktion & Antikörper";
    return "Weitere Immunmarker";
  }
  if (topicKey === "organe") {
    if (/\b(gpt|alt|got|ast|ggt|gamma gt|alkalische phosphatase|bilirubin|cholinesterase|gldh)\b/.test(text)) return "Leber & Galle";
    if (/\b(kreatinin|creatinin|cystatin|egfr|gfr|harnstoff|harnsaure|urea|natrium|kalium|chlorid|calcium|kalzium|magnesium|phosphat|osmolalitat)\b/.test(text)) return "Niere & Elektrolyte";
    if (/\b(lipase|amylase|pankreas|elastase)\b/.test(text)) return "Pankreas & Verdauung";
    if (/\b(ck|creatinkinase|troponin|nt probnp|probnp|myoglobin|ldh)\b/.test(text)) return "Herz & Muskulatur";
    if (/\b(albumin|gesamtprotein|gesamteiweiss|eiweiss|globulin)\b/.test(text)) return "Proteine & Synthese";
    return "Weitere Organmarker";
  }
  if (topicKey === "stoffwechsel") {
    if (/\b(vitamin|25 oh|calcidiol|calcitriol|folsaure|folat|b12|cobalamin|holo tc|thiamin|riboflavin|pyridoxin|biotin)\b/.test(text)) return "Vitamine";
    if (/\b(ferritin|eisen|transferrin|transferrinsattigung|transferrin rezeptor)\b/.test(text)) return "Eisenstoffwechsel";
    if (/\b(zink|kupfer|selen|jod|iod|mangan|chrom|molybdan|molybdaen)\b/.test(text)) return "Spurenelemente";
    if (/\b(homocystein|methylmalon|organische sauren|organische saeure|pyrrol|kryptopyrrol|hpl)\b/.test(text)) return "Organische Säuren & Methylierung";
    if (/\b(glukose|glucose|hba1c|insulin|c peptid|laktat|pyruvat)\b/.test(text)) return "Glukose & Energie";
    if (/\b(cholesterin|hdl|ldl|triglycerid|lipoprotein|apolipoprotein)\b/.test(text)) return "Lipide";
    return "Weitere Stoffwechselmarker";
  }
  if (/\b(akkermansia|faecalibacterium|roseburia|butyrat|buttersaure|mucin|mukosa|acetat|propionat|laktatproduktion)\b/.test(text)) return "Schleimhaut & Butyrat";
  if (/\b(calprotectin|zonulin|i fabp|ifabp|alpha 1 antitrypsin|siga|secretorisches|lactoferrin|barriere|entzundung)\b/.test(text)) return "Entzündung & Barriere";
  if (/\b(candida|pilz|blastocystis|giardia|helicobacter|campylobacter|salmonell|shigell|yersin|parasiten|clostridium difficile)\b/.test(text)) return "Erreger & Pilze";
  if (/\b(biodivers|shannon|firmicutes bacteroidetes|enterotyp|ratio)\b/.test(text)) return "Diversität";
  if (/\b(bifidobacter|lactobacill|enterococc|escherichia|bacteroides|prevotella|clostrid|streptococc|proteobacteria|firmicutes|actinobacteria)/.test(text)) return "Leitkeime";
  return "Weitere Stuhlmarker";
}

function topicDate(row) {
  return row._date ? formatDate(row._date) : row.Datum || "-";
}

function topicValue(row) {
  return `${row.Ergebnis_text || row.Ergebnis || "-"} ${row.Einheit || ""}`.trim();
}

function topicSource(row) {
  const text = sourceText(row) || row.Labor || "-";
  const href = reportHref(row);
  return href
    ? `<a class="topicLink" href="${escapeAttr(href)}">${escapeHtml(text)}</a>`
    : escapeHtml(text);
}

function buildTopicGroups(rows, topicKey) {
  const map = new Map();
  for (const row of rows) {
    const key = row._key || normalizeText(row.Standardname || row.Name_im_Bericht);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].map(([key, groupRows]) => {
    const sorted = [...groupRows].sort((a, b) => (b._date?.getTime() || 0) - (a._date?.getTime() || 0));
    const latest = sorted[0];
    const previous = sorted[1];
    const everAbnormal = groupRows.some(isAbnormal);
    const latestAbnormal = isAbnormal(latest);
    const latestOk = isOk(latest);
    const latestOpen = isOpen(latest);
    return {
      key,
      rows: sorted,
      latest,
      previous,
      displayName: displayNameForGroup(groupRows, key),
      bucket: topicBucket(latest, topicKey),
      everAbnormal,
      latestAbnormal,
      latestOk,
      latestOpen,
      latestTime: latest?._date?.getTime() || 0,
    };
  }).sort((a, b) => b.latestTime - a.latestTime || a.displayName.localeCompare(b.displayName, "de"));
}

function topicTrend(group) {
  if (!group.previous) return "Einzelwert";
  if (group.latestAbnormal && isOk(group.previous)) return "neu auffällig";
  if (group.latestOk && isAbnormal(group.previous)) return "verbessert";
  if (group.latestAbnormal && isAbnormal(group.previous)) return "weiter auffällig";
  if (group.latestOpen) return "offen";
  if (group.latestOk) return "stabil ok";
  return "Verlauf vorhanden";
}

function topicCardClass(group) {
  if (group.latestAbnormal) return "attention";
  if (group.latestOpen) return "open";
  if (group.latestOk) return "ok";
  return "neutral";
}

function topicRowClass(row) {
  if (isAbnormal(row)) return "attention";
  if (isOpen(row)) return "open";
  if (isOk(row)) return "ok";
  return "neutral";
}

function currentTopicFocusSort() {
  return state.topicFocusSorts[state.activeTopic] || "priority";
}

function sortTopicFocusGroups(groups) {
  const byDateDesc = (a, b) => b.latestTime - a.latestTime || a.displayName.localeCompare(b.displayName, "de");
  const sort = currentTopicFocusSort();
  return [...groups].sort((a, b) => {
    if (sort === "dateDesc") return byDateDesc(a, b);
    if (sort === "dateAsc") return a.latestTime - b.latestTime || a.displayName.localeCompare(b.displayName, "de");
    if (sort === "nameAsc") return a.displayName.localeCompare(b.displayName, "de");
    if (sort === "nameDesc") return b.displayName.localeCompare(a.displayName, "de");
    return Number(b.latestAbnormal) - Number(a.latestAbnormal) || Number(b.latestOpen) - Number(a.latestOpen) || byDateDesc(a, b);
  });
}

function syncTopicFocusSort() {
  const sort = currentTopicFocusSort();
  const label = TOPIC_FOCUS_SORT_LABELS[sort] || TOPIC_FOCUS_SORT_LABELS.priority;
  els.topicFocusSortButton.textContent = label;
  els.topicFocusSortButton.setAttribute("title", `Im Blick sortieren: ${label}`);
  for (const option of els.topicFocusSortOptions) {
    const active = option.dataset.topicSort === sort;
    option.classList.toggle("active", active);
    option.setAttribute("aria-current", active ? "true" : "false");
  }
}

function setTopicFocusSortMenu(open) {
  els.topicFocusSortMenu.hidden = !open;
  els.topicFocusSortButton.setAttribute("aria-expanded", String(open));
}

function renderTopicStat(label, value, note, tone = "") {
  return `
    <div class="topicStat ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </div>
  `;
}

function renderTopicList(groups, emptyText) {
  if (!groups.length) return `<div class="emptyState">${escapeHtml(emptyText)}</div>`;
  return groups.map((group) => `
    <article class="topicItem ${topicCardClass(group)}">
      <button class="topicItemButton" type="button" data-topic-history-key="${escapeAttr(group.key)}" aria-label="Historie für ${escapeAttr(group.displayName)} öffnen">
        <div class="topicItemMain">
          <strong>${escapeHtml(group.displayName)}</strong>
          <span>${escapeHtml(topicDate(group.latest))} · ${escapeHtml(topicValue(group.latest))}</span>
        </div>
        <div class="topicItemMeta">
          ${badge(group.latest.Bewertung)}
          <span>${escapeHtml(group.bucket)}</span>
          <span>${escapeHtml(topicTrend(group))}</span>
        </div>
        <div class="topicItemAction">
          <span>${escapeHtml(group.rows.length === 1 ? "1 Messwert" : `${group.rows.length} Messwerte`)}</span>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M7 5l5 5-5 5"></path>
          </svg>
        </div>
      </button>
      <div class="topicItemSource">${topicSource(group.latest)}</div>
    </article>
  `).join("");
}

function renderTopicHistorySummary(group) {
  const rows = group.rows;
  const latest = rows[0];
  const oldest = rows.at(-1);
  const units = unique(rows.map((row) => row.Einheit).filter(Boolean));
  const abnormalCount = rows.filter(isAbnormal).length;
  const openCount = rows.filter(isOpen).length;
  const range = oldest && latest && oldest !== latest
    ? `${oldest._date ? formatShortDate(oldest._date) : "-"} - ${latest._date ? formatShortDate(latest._date) : "-"}`
    : latest
      ? latest._date ? formatShortDate(latest._date) : "-"
      : "-";
  const unitLabel = units.length > 1 ? `${units.length} Einheiten` : units[0] || "ohne Einheit";
  const flags = [
    abnormalCount ? `${abnormalCount} auffällig` : "",
    openCount ? `${openCount} offen` : "",
  ].filter(Boolean).join(" · ") || "keine Auffälligkeit im Verlauf";

  return [
    ["Letzter Wert", latest ? topicValue(latest) : "-"],
    ["Zeitraum", range],
    ["Einheiten", unitLabel],
    ["Status", flags],
  ].map(([label, value]) => `
    <div class="topicHistorySummaryItem">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function renderTopicHistoryChart(group) {
  const chartData = normalizeRowsForChart([...group.rows].sort((a, b) => (a._date?.getTime() || 0) - (b._date?.getTime() || 0)));
  const rows = chartData.rows.filter((row) => row._date && row._plotValue !== null);
  const noteParts = [];
  if (chartData.targetUnit) noteParts.push(`Grafik in ${chartData.targetUnit}`);
  if (chartData.convertedCount) {
    noteParts.push(chartData.convertedCount === 1 ? "1 Wert umgerechnet" : `${chartData.convertedCount} Werte umgerechnet`);
  }
  if (chartData.excludedCount) {
    noteParts.push(chartData.excludedCount === 1
      ? "1 Wert anderer Einheit nicht gezeichnet"
      : `${chartData.excludedCount} Werte anderer Einheiten nicht gezeichnet`);
  }
  const note = noteParts.join(" · ");

  if (rows.length < 2) {
    return `<div class="topicHistoryChartNote">${escapeHtml(note || "Zu wenige kompatible numerische Werte für eine Verlaufsgrafik.")}</div>`;
  }

  const width = 640;
  const height = 144;
  const pad = { top: 18, right: 18, bottom: 24, left: 42 };
  const times = rows.map((row) => row._date.getTime());
  const refValues = rows.flatMap((row) => [row._plotRefMin, row._plotRefMax]).filter((value) => value !== null);
  const values = [...rows.map((row) => row._plotValue), ...refValues];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const yPad = (max - min) * 0.12;
  min -= yPad;
  max += yPad;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const x = (time) => pad.left + ((time - minTime) / Math.max(1, maxTime - minTime)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - ((value - min) / (max - min))) * (height - pad.top - pad.bottom);
  const points = rows.map((row) => ({ row, x: x(row._date.getTime()), y: y(row._plotValue) }));
  const linePath = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const refMin = rows.map((row) => row._plotRefMin).filter((value) => value !== null);
  const refMax = rows.map((row) => row._plotRefMax).filter((value) => value !== null);
  const showBand = refMin.length && refMax.length;
  const bandLow = showBand ? y(Math.min(...refMin)) : 0;
  const bandHigh = showBand ? y(Math.max(...refMax)) : 0;

  return `
    <div class="topicHistorySpark">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Kleiner Verlauf für ${escapeAttr(group.displayName)}">
        <line class="topicHistoryAxis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
        ${showBand ? `<rect class="topicHistoryRefBand" x="${pad.left}" y="${Math.min(bandLow, bandHigh).toFixed(1)}" width="${width - pad.left - pad.right}" height="${Math.abs(bandHigh - bandLow).toFixed(1)}"></rect>` : ""}
        <path class="topicHistorySparkLine" d="${escapeAttr(linePath)}"></path>
        ${points.map((point) => `<circle class="topicHistorySparkPoint ${topicRowClass(point.row)}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4.2"></circle>`).join("")}
        <text x="${pad.left}" y="${height - 6}">${escapeHtml(formatShortDate(rows[0]._date))}</text>
        <text x="${width - pad.right}" y="${height - 6}" text-anchor="end">${escapeHtml(formatShortDate(rows.at(-1)._date))}</text>
      </svg>
      <span>${escapeHtml(note || "Verlaufsgrafik")}</span>
    </div>
  `;
}

function renderTopicHistoryRows(group) {
  return group.rows.map((row) => {
    const reference = row.Referenzbereich || (row._refMin !== null || row._refMax !== null
      ? [row.Referenz_min, row.Referenz_max].filter(Boolean).join(" - ")
      : "");
    return `
      <article class="topicHistoryRow ${topicRowClass(row)}">
        <div class="topicHistoryValue">
          <time>${escapeHtml(topicDate(row))}</time>
          <strong>${escapeHtml(topicValue(row))}</strong>
        </div>
        <div class="topicHistoryDetails">
          ${badge(row.Bewertung)}
          <span>Referenz: ${escapeHtml(reference || "-")}</span>
          <span>Original: ${escapeHtml(row.Name_im_Bericht || row.Standardname || "-")}</span>
        </div>
        <div class="topicHistorySource">${topicSource(row)}</div>
      </article>
    `;
  }).join("");
}

function closeTopicHistory() {
  els.topicHistoryModal.hidden = true;
  document.body.classList.remove("modalOpen");
}

function openTopicGroupInExplorer(key) {
  const group = state.groups.find((item) => item.key === key);
  if (!group) return;
  closeTopicHistory();
  els.searchInput.value = group.displayName;
  if (els.categoryFilter) els.categoryFilter.value = "";
  if (els.labFilter) els.labFilter.value = "";
  if (els.statusFilter) els.statusFilter.value = "";
  resetDateFilter();
  state.hasUserSelection = true;
  state.selectedKeys = [group.key];
  state.selectedKey = group.key;
  state.selectedRowId = null;
  resetChartZoom();
  updateMatches();
  setActiveView("start");
  requestAnimationFrame(() => els.chartPanel.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function openTopicHistory(key) {
  const config = TOPIC_CONFIGS[state.activeTopic];
  if (!config) return;
  const groups = buildTopicGroups(state.rows.filter(config.filter), state.activeTopic);
  const group = groups.find((item) => item.key === key);
  if (!group) return;
  els.topicHistoryTitle.textContent = group.displayName;
  els.topicHistorySubtitle.textContent = `${group.bucket} · ${topicTrend(group)}`;
  els.topicHistoryCount.textContent = group.rows.length === 1 ? "1 Wert" : `${group.rows.length} Werte`;
  els.topicHistoryExplore.dataset.topicHistoryKey = group.key;
  els.topicHistorySummary.innerHTML = renderTopicHistorySummary(group);
  els.topicHistoryChart.innerHTML = renderTopicHistoryChart(group);
  els.topicHistoryRows.innerHTML = renderTopicHistoryRows(group);
  els.topicHistoryModal.hidden = false;
  document.body.classList.add("modalOpen");
  requestAnimationFrame(() => els.topicHistoryClose.focus({ preventScroll: true }));
}

function renderTopicCategories(groups) {
  const map = new Map();
  for (const group of groups) {
    if (!map.has(group.bucket)) {
      map.set(group.bucket, { name: group.bucket, count: 0, abnormal: 0, ok: 0, open: 0, latestTime: 0 });
    }
    const item = map.get(group.bucket);
    item.count += 1;
    if (group.latestAbnormal) item.abnormal += 1;
    if (group.latestOk) item.ok += 1;
    if (group.latestOpen) item.open += 1;
    item.latestTime = Math.max(item.latestTime, group.latestTime);
  }
  const categories = [...map.values()].sort((a, b) => b.abnormal - a.abnormal || b.count - a.count || a.name.localeCompare(b.name, "de"));
  els.topicCategoryCount.textContent = String(categories.length);
  els.topicCategoryList.innerHTML = categories.map((item) => {
    const okWidth = item.count ? Math.round((item.ok / item.count) * 100) : 0;
    return `
      <article class="topicCategory">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${item.count} Marker · ${item.abnormal} auffällig · ${item.open} offen</span>
        </div>
        <div class="categoryMeter" aria-hidden="true"><span style="width:${okWidth}%"></span></div>
      </article>
    `;
  }).join("");
}

function renderTopicTimeline(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.Quelldatei || row.Datum || row._rowId;
    if (!map.has(key)) {
      map.set(key, { key, rows: [], latestTime: 0, sample: row });
    }
    const item = map.get(key);
    item.rows.push(row);
    item.latestTime = Math.max(item.latestTime, row._date?.getTime() || 0);
    if ((row._date?.getTime() || 0) >= (item.sample._date?.getTime() || 0)) item.sample = row;
  }
  const items = [...map.values()].sort((a, b) => b.latestTime - a.latestTime).slice(0, 9);
  els.topicTimelineCount.textContent = String(map.size);
  els.topicTimeline.innerHTML = items.map((item) => {
    const abnormal = item.rows.filter(isAbnormal).length;
    const open = item.rows.filter(isOpen).length;
    const date = item.sample._date ? formatDate(item.sample._date) : item.sample.Datum || "-";
    return `
      <article class="timelineItem">
        <time>${escapeHtml(date)}</time>
        <div>
          <strong>${topicSource(item.sample)}</strong>
          <span>${item.rows.length} Werte · ${abnormal} auffällig · ${open} offen</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderTopicRows(rows, topicKey) {
  const sorted = [...rows].sort((a, b) => (b._date?.getTime() || 0) - (a._date?.getTime() || 0) || topicBucket(a, topicKey).localeCompare(topicBucket(b, topicKey), "de"));
  els.topicTableCount.textContent = String(sorted.length);
  els.topicRows.innerHTML = sorted.map((row) => `
    <tr>
      <td>${escapeHtml(row.Datum)}</td>
      <td><strong>${escapeHtml(row.Standardname || row.Name_im_Bericht)}</strong></td>
      <td>${escapeHtml(topicValue(row))}</td>
      <td>${badge(row.Bewertung)}</td>
      <td>${escapeHtml(topicBucket(row, topicKey))}</td>
      <td>${topicSource(row)}</td>
    </tr>
  `).join("");
}

function reportDateFromFilename(file) {
  const match = String(file || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return toDate(`${match[1]}-${match[2]}-${match[3]}`);
}

function reportDateLabel(report) {
  return report.date ? formatDate(report.date) : "-";
}

function reportSpanLabel(report) {
  if (!report.firstDate || !report.lastDate) return "";
  if (report.firstDate.getTime() === report.lastDate.getTime()) return formatDate(report.firstDate);
  return `${formatDate(report.firstDate)} bis ${formatDate(report.lastDate)}`;
}

function buildReports(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.Quelldatei) continue;
    if (!map.has(row.Quelldatei)) map.set(row.Quelldatei, []);
    map.get(row.Quelldatei).push(row);
  }
  return [...map.entries()].map(([file, reportRows]) => {
    const dates = reportRows.map((row) => row._date).filter(Boolean).sort((a, b) => a - b);
    const fileDate = reportDateFromFilename(file);
    const lastDate = dates.at(-1) || null;
    const firstDate = dates[0] || null;
    const date = fileDate || lastDate || firstDate;
    return {
      file,
      rows: reportRows,
      date,
      firstDate,
      lastDate,
      labs: unique(reportRows.map((row) => row.Labor)).slice(0, 3),
      categories: unique(reportRows.map((row) => row.Dokumentkategorie || row.Kategorie)).slice(0, 4),
      abnormalCount: reportRows.filter(isAbnormal).length,
      openCount: reportRows.filter(isOpen).length,
      okCount: reportRows.filter(isOk).length,
    };
  }).sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0) || a.file.localeCompare(b.file, "de"));
}

function reportSearchDetails(report, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return { matches: true, page: null, snippet: "" };
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const indexEntry = state.reportSearchIndex.get(report.file);
  const pages = Array.isArray(indexEntry?.pages) ? indexEntry.pages : [];
  const metadata = [
    report.file,
    ...report.labs,
    ...report.categories,
    ...report.rows.flatMap((row) => [row.Standardname, row.Name_im_Bericht, row.Abschnitt]),
  ].join(" ");
  const pageSearchText = pages.map((page) => normalizeSearchText(page.text)).join(" ");
  const completeSearchText = `${normalizeSearchText(metadata)} ${pageSearchText}`;
  if (!terms.every((term) => completeSearchText.includes(term))) {
    return { matches: false, page: null, snippet: "" };
  }

  const rankedPages = pages
    .map((page) => {
      const text = normalizeSearchText(page.text);
      return { page, score: terms.filter((term) => text.includes(term)).length };
    })
    .sort((a, b) => b.score - a.score || Number(a.page.number) - Number(b.page.number));
  const best = rankedPages[0];
  if (!best?.score) return { matches: true, page: null, snippet: "" };
  const text = String(best.page.text || "").replace(/\s+/g, " ").trim();
  const lower = text.toLocaleLowerCase("de-DE");
  const rawTerms = String(query).trim().toLocaleLowerCase("de-DE").split(/\s+/).filter(Boolean);
  const index = rawTerms.map((term) => lower.indexOf(term)).find((position) => position >= 0) ?? 0;
  const start = Math.max(0, index - 75);
  const end = Math.min(text.length, start + 230);
  const snippet = `${start ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
  return { matches: true, page: Number(best.page.number) || null, snippet };
}

function renderReports() {
  const allReports = buildReports(state.rows);
  const query = state.reportSearchQuery.trim();
  const reports = allReports
    .map((report) => ({ ...report, search: reportSearchDetails(report, query) }))
    .filter((report) => report.search.matches);
  const latest = allReports[0];
  const labs = unique(state.rows.map((row) => row.Labor));
  els.reportStats.innerHTML = [
    renderTopicStat("Berichte", allReports.length.toLocaleString("de-DE"), "Laborberichte", "blue"),
    renderTopicStat("Neuester Bericht", latest ? reportDateLabel(latest) : "-", latest?.labs.join(", ") || "keine Quelle", "ok"),
    renderTopicStat("Labore", labs.length.toLocaleString("de-DE"), "aus allen Berichten", "blue"),
    renderTopicStat("Messwerte", state.rows.length.toLocaleString("de-DE"), "in Berichten verknüpft", "open"),
  ].join("");
  els.reportCount.textContent = String(reports.length);
  els.reportSearchStatus.textContent = query
    ? `${reports.length.toLocaleString("de-DE")} von ${allReports.length.toLocaleString("de-DE")} Berichten`
    : `${allReports.length.toLocaleString("de-DE")} Berichte durchsuchbar`;
  if (!reports.length) {
    els.reportList.innerHTML = query
      ? `<div class="emptyState">Keine Laborberichte für „${escapeHtml(query)}“ gefunden.</div>`
      : '<div class="emptyState">Noch keine verknüpften Laborberichte gefunden.</div>';
    return;
  }

  const byYear = new Map();
  for (const report of reports) {
    const year = report.date ? String(report.date.getFullYear()) : "Ohne Datum";
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(report);
  }
  els.reportList.innerHTML = [...byYear.entries()].map(([year, yearReports]) => `
    <section class="reportYearGroup">
      <h3>${escapeHtml(year)}</h3>
      <div class="reportCards">
        ${yearReports.map((report) => {
          const span = reportSpanLabel(report);
          return `
            <article class="reportCard">
              <div class="reportDate">
                <time>${escapeHtml(reportDateLabel(report))}</time>
                <span>${escapeHtml(report.rows.length.toLocaleString("de-DE"))} Werte</span>
              </div>
              <div class="reportBody">
                <a class="reportTitle" href="${escapeAttr(reportFileHref(report.file))}">${escapeHtml(report.file)}</a>
                <div class="reportMeta">
                  <span>${escapeHtml(report.labs.join(", ") || "Labor nicht angegeben")}</span>
                  ${span ? `<span>Messzeitraum: ${escapeHtml(span)}</span>` : ""}
                </div>
                ${query && report.search.page ? `
                  <a class="reportSearchHit" href="${escapeAttr(reportFileHref(report.file, report.search.page))}">
                    <strong>Inhaltstreffer auf Seite ${escapeHtml(report.search.page)}</strong>
                    <span>${escapeHtml(report.search.snippet)}</span>
                  </a>
                ` : ""}
                <div class="reportChips">
                  ${report.categories.map((category) => `<span>${escapeHtml(category)}</span>`).join("")}
                  ${report.abnormalCount ? `<span class="attention">${report.abnormalCount} auffällig</span>` : ""}
                  ${report.openCount ? `<span class="open">${report.openCount} offen</span>` : ""}
                  ${report.okCount ? `<span class="ok">${report.okCount} in Ordnung</span>` : ""}
                </div>
              </div>
              <div class="reportActions">
                <a class="reportOpenLink" href="${escapeAttr(reportFileHref(report.file))}">Bericht öffnen</a>
                ${documentActionButtons(report.file, "pdf", report.file)}
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");
}

function renderTopic() {
  const config = TOPIC_CONFIGS[state.activeTopic];
  if (!config) return;
  const rows = state.rows.filter(config.filter);
  const groups = buildTopicGroups(rows, state.activeTopic);
  const latestDate = rows
    .map((row) => row._date)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  const currentAttention = groups.filter((group) => group.latestAbnormal);
  const openGroups = groups.filter((group) => group.latestOpen && !group.latestAbnormal);
  const okGroups = groups.filter((group) => group.latestOk);
  const focusGroups = sortTopicFocusGroups([...currentAttention, ...openGroups]);

  els.topicEyebrow.textContent = config.label;
  els.topicTitle.textContent = config.title;
  els.topicSubtitle.textContent = latestDate
    ? `${config.subtitle} Letzter Eintrag: ${formatDate(latestDate)}.`
    : config.subtitle;
  els.topicStats.innerHTML = [
    renderTopicStat("Marker", groups.length.toLocaleString("de-DE"), `${rows.length.toLocaleString("de-DE")} Messwerte`, "blue"),
    renderTopicStat("Auffällig", currentAttention.length.toLocaleString("de-DE"), "aktuell im Blick", currentAttention.length ? "attention" : "ok"),
    renderTopicStat("In Ordnung", okGroups.length.toLocaleString("de-DE"), "zuletzt im Referenzbereich", "ok"),
    renderTopicStat("Offen", openGroups.length.toLocaleString("de-DE"), "unbewertet / Prüfbedarf", openGroups.length ? "open" : "blue"),
  ].join("");

  syncTopicFocusSort();
  els.topicFocusCount.textContent = String(focusGroups.length);
  els.topicFocusList.innerHTML = renderTopicList(focusGroups, "Keine aktuell auffälligen oder offenen Marker in dieser Themenansicht.");
  els.topicGoodCount.textContent = String(okGroups.length);
  els.topicGoodList.innerHTML = renderTopicList(okGroups, "Noch keine zuletzt klar unauffälligen Marker in dieser Themenansicht.");
  renderTopicCategories(groups);
  renderTopicTimeline(rows);
  renderTopicRows(rows, state.activeTopic);
}

function wireEvents() {
  for (const tab of els.viewTabs) {
    tab.addEventListener("click", () => setActiveView(tab.dataset.view));
  }
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-view-link]");
    if (!link) return;
    event.preventDefault();
    setActiveView(link.dataset.viewLink || viewFromHash());
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-share-document]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    shareDocumentFromOverview(button);
  });
  window.addEventListener("hashchange", () => setActiveView(viewFromHash(), { updateHash: false }));
  els.topicFocusSortButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setTopicFocusSortMenu(els.topicFocusSortMenu.hidden);
  });
  for (const option of els.topicFocusSortOptions) {
    option.addEventListener("click", () => {
      state.topicFocusSorts[state.activeTopic] = option.dataset.topicSort || "priority";
      setTopicFocusSortMenu(false);
      renderTopic();
    });
  }
  els.topicView.addEventListener("click", (event) => {
    const button = event.target.closest("[data-topic-history-key]");
    if (!button) return;
    openTopicHistory(button.dataset.topicHistoryKey);
  });
  els.topicHistoryExplore.addEventListener("click", () => {
    openTopicGroupInExplorer(els.topicHistoryExplore.dataset.topicHistoryKey);
  });
  els.topicHistoryClose.addEventListener("click", closeTopicHistory);
  els.topicHistoryModal.addEventListener("click", (event) => {
    if (event.target === els.topicHistoryModal) closeTopicHistory();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".topicSort")) setTopicFocusSortMenu(false);
    if (!event.target.closest(".searchField")) hideSearchSuggestions();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!els.topicHistoryModal.hidden) {
      closeTopicHistory();
      return;
    }
    hideSearchSuggestions();
    setTopicFocusSortMenu(false);
  });
  els.searchInput.addEventListener("input", () => {
    state.searchSuggestIndex = -1;
    updateMatches();
  });
  els.searchInput.addEventListener("focus", () => updateMatches());
  els.searchInput.addEventListener("keydown", handleSearchSuggestKeydown);
  els.searchSuggest.addEventListener("pointerdown", (event) => {
    const button = event.target.closest("[data-suggestion-key]");
    if (!button) return;
    event.preventDefault();
    applySearchSuggestion(button.dataset.suggestionKey);
  });
  els.searchSuggest.addEventListener("mousedown", (event) => event.preventDefault());
  els.searchSuggest.addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggestion-key]");
    if (button) applySearchSuggestion(button.dataset.suggestionKey);
  });
  for (const el of [els.categoryFilter, els.labFilter, els.statusFilter].filter(Boolean)) {
    el.addEventListener("input", updateMatches);
    el.addEventListener("change", updateMatches);
  }
  els.dateFilterToggle.addEventListener("click", () => {
    els.datePopover.hidden = !els.datePopover.hidden;
  });
  els.dateApply.addEventListener("click", () => {
    updateDateRangeFromInputs();
    els.datePopover.hidden = true;
    resetChartZoom();
    renderSelected();
  });
  els.dateReset.addEventListener("click", () => {
    resetDateFilter();
    els.datePopover.hidden = true;
    resetChartZoom();
    renderSelected();
  });
  els.chartToggle.addEventListener("click", () => {
    setPanelCollapsed("chart", !state.chartCollapsed);
  });
  els.tableToggle.addEventListener("click", () => {
    setPanelCollapsed("table", !state.tableCollapsed);
  });
  for (const button of els.sortButtons) {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      if (state.tableSort.key === key) {
        state.tableSort.direction = state.tableSort.direction === "asc" ? "desc" : "asc";
      } else {
        state.tableSort = { key, direction: key === "date" ? "desc" : "asc" };
      }
      renderSelected();
    });
  }
  els.chartZoomReset.addEventListener("click", () => {
    resetChartZoom();
    drawChart(state.chartRows);
  });
  els.sameUnitOnly.addEventListener("change", () => {
    resetChartZoom();
    renderSelected();
  });
  els.compareMode.addEventListener("change", () => {
    state.compareMode = els.compareMode.checked;
    if (!state.compareMode && state.selectedKeys.length > 1) {
      state.selectedKeys = [state.selectedKey || state.selectedKeys[0]];
    }
    state.selectedKey = state.selectedKeys[0] || null;
    state.selectedRowId = null;
    resetChartZoom();
    renderSelected();
    updateMatches();
  });
  els.chart.addEventListener("wheel", zoomChartAt, { passive: false });
  els.chart.addEventListener("dblclick", () => {
    resetChartZoom();
    drawChart(state.chartRows);
  });
  els.chart.addEventListener("mousemove", (event) => {
    const point = chartEventPoint(event);
    const nextId = point?.row._rowId || null;
    els.chart.style.cursor = point ? "pointer" : "default";
    showChartTooltip(point, event);
    if (nextId !== state.hoveredPointId) {
      state.hoveredPointId = nextId;
      drawChart(state.chartRows);
    }
  });
  els.chart.addEventListener("mouseleave", () => {
    state.hoveredPointId = null;
    els.chartTooltip.hidden = true;
    els.chart.style.cursor = "default";
    drawChart(state.chartRows);
  });
  els.chart.addEventListener("click", (event) => {
    const point = chartEventPoint(event);
    if (point) selectHistoryRow(point.row._rowId);
  });
  els.historyRows.addEventListener("click", (event) => {
    const link = event.target.closest("a.compactLink");
    if (link) {
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(link.href);
      return;
    }
    const button = event.target.closest(".compactMore");
    if (button) {
      const wrap = button.closest(".compactWrap");
      for (const open of els.historyRows.querySelectorAll(".compactWrap.open")) {
        if (open !== wrap) open.classList.remove("open");
      }
      wrap.classList.toggle("open");
      return;
    }
    const row = event.target.closest("tr[data-row-id]");
    if (row) selectHistoryRow(row.dataset.rowId, { scroll: false });
  });
  els.allValuesSearch?.addEventListener("input", () => {
    state.allValuesQuery = els.allValuesSearch.value;
    state.allValuesVisibleLimit = 300;
    renderAllValues();
  });
  els.reportSearchInput?.addEventListener("input", () => {
    state.reportSearchQuery = els.reportSearchInput.value;
    renderReports();
  });
  els.allValuesSort?.addEventListener("change", () => {
    state.allValuesSort = els.allValuesSort.value || "dateDesc";
    state.allValuesVisibleLimit = 300;
    renderAllValues();
  });
  els.allValuesMore?.addEventListener("click", () => {
    state.allValuesVisibleLimit += 300;
    renderAllValues();
  });
  els.allValuesExportCsv?.addEventListener("click", exportAllValuesCsv);
  els.allValuesExportExcel?.addEventListener("click", exportAllValuesExcel);
  els.allValuesExportPdf?.addEventListener("click", exportAllValuesPdf);
  els.allValuesRows?.addEventListener("click", (event) => {
    const link = event.target.closest("a.compactLink");
    if (!link) return;
    event.preventDefault();
    window.location.assign(link.href);
  });
  els.bioAgeAutofill?.addEventListener("click", () => {
    state.bioAgeManualValues = {};
    localStorage.removeItem(BIO_AGE_STORAGE_KEY);
    fillBioAgeInputsFromAuto();
    renderBioAge();
  });
  els.bioAgeForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    renderBioAge();
  });
  for (const button of els.bioAgeModelButtons) {
    button.addEventListener("click", () => setBioAgeModel(button.dataset.bioAgeModel));
  }
  for (const button of els.labSheetButtons) {
    button.addEventListener("click", () => setLabSheet(button.dataset.labSheet));
  }
  els.bioAgeSave?.addEventListener("click", saveBioAgeManualValues);
  els.bioAgeClear?.addEventListener("click", clearBioAgeManualValues);
  els.bioBirthDate?.addEventListener("change", handleBioBirthDateChange);
  els.bioChronAge?.addEventListener("input", renderBioAge);
  els.bioAgeInputs?.addEventListener("input", renderBioAge);
  window.addEventListener("resize", () => {
    if (state.activeView === "start" && state.activeLabSheet === "labor") renderSelected();
  });
}

function installQaApi() {
  if (new URLSearchParams(window.location.search).get("qa") !== "1") return;
  const qaApi = Object.freeze({
    auditSearchTerms() {
      const misses = [];
      let termsChecked = 0;
      for (const row of state.rows) {
        for (const [field, value] of [["Standardname", row.Standardname], ["Name_im_Bericht", row.Name_im_Bericht]]) {
          const query = normalizeSearchText(value);
          if (!query) continue;
          termsChecked += 1;
          const matches = state.groups.filter((group) => groupSearchScore(group, query) < 9);
          if (!matches.some((group) => group.key === row._key)) {
            misses.push({ rowId: row._rowId, field, value, expectedKey: row._key, matchedKeys: matches.map((group) => group.key) });
          }
        }
      }
      for (const group of state.groups) {
        for (const alias of group.aliases || []) {
          const query = normalizeSearchText(alias);
          if (!query) continue;
          termsChecked += 1;
          const matches = state.groups.filter((candidate) => groupSearchScore(candidate, query) < 9);
          if (!matches.some((candidate) => candidate.key === group.key)) {
            misses.push({ field: "Suchalias", value: alias, expectedKey: group.key, matchedKeys: matches.map((candidate) => candidate.key) });
          }
        }
      }
      return {
        rows: state.rows.length,
        groups: state.groups.length,
        termsChecked,
        misses,
      };
    },
    auditChartUnits() {
      const failures = [];
      let groupsChecked = 0;
      for (const group of state.groups) {
        const numericRows = group.rows.filter((row) => row._date && row._value !== null);
        if (!numericRows.length) continue;
        groupsChecked += 1;
        const result = normalizeRowsForChart(numericRows);
        for (const row of result.rows) {
          if (row._plotValue !== null && !Number.isFinite(row._plotValue)) {
            failures.push({ key: group.key, rowId: row._rowId, reason: "non-finite plot value" });
          }
          if (row._plotRefMin !== null && !Number.isFinite(row._plotRefMin)) {
            failures.push({ key: group.key, rowId: row._rowId, reason: "non-finite reference minimum" });
          }
          if (row._plotRefMax !== null && !Number.isFinite(row._plotRefMax)) {
            failures.push({ key: group.key, rowId: row._rowId, reason: "non-finite reference maximum" });
          }
          const profile = CHART_UNIT_PROFILES[row._key];
          const supported = profile && Number.isFinite(profile.units[canonicalUnit(row.Einheit)]);
          if (supported && row._plotValue === null) {
            failures.push({ key: group.key, rowId: row._rowId, unit: row.Einheit, reason: "supported profile unit excluded" });
          }
        }
      }
      return { groupsChecked, failures };
    },
  });
  window.__LAB_RESULTS_QA__ = qaApi;
  const resultNode = document.createElement("script");
  resultNode.id = "labResultsQaReport";
  resultNode.type = "application/json";
  resultNode.textContent = JSON.stringify({
    search: qaApi.auditSearchTerms(),
    units: qaApi.auditChartUnits(),
  });
  document.head.append(resultNode);
}

async function init() {
  renderVersionLabels();
  if (window.location.protocol === "file:") {
    els.datasetMeta.textContent = "Bitte über http://127.0.0.1:8765/dashboard/ öffnen, damit die Labordaten geladen werden können.";
    els.matchList.innerHTML = '<div class="emptyState">Dashboard ist direkt als Datei geöffnet. Starte den lokalen Server und nutze die http-Adresse.</div>';
    return;
  }
  const table = parseCsv(await loadCsvText());
  state.rows = mapRows(table);
  state.groups = buildGroups(state.rows);
  state.documents = await loadDocumentIndex();
  state.reportSearchIndex = await loadReportSearchIndex();
  setupBioAge();
  setupDateFilter(state.rows);

  populateSelect(els.categoryFilter, "Alle Kategorien", unique(state.rows.map((r) => r.Kategorie)));
  populateSelect(els.labFilter, "Alle Labore", unique(state.rows.map((r) => r.Labor)));
  els.recordCount.textContent = `${state.rows.length.toLocaleString("de-DE")} Werte`;
  els.sourceCount.textContent = `${unique(state.rows.map((r) => r.Quelldatei)).length} Laborberichte`;
  els.datasetMeta.textContent = "Aktuelle Labordatenbank";
  installQaApi();
  wireEvents();
  updateMatches();
  setActiveView(viewFromHash(), { updateHash: false });
}

init().catch((error) => {
  console.error(error);
  els.datasetMeta.textContent = error.message;
});
