# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: snapshot.spec.ts >> navigation between public pages stays in the snapshot
- Location: snapshot-e2e/snapshot.spec.ts:56:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 5

- Array []
+ Array [
+   "/fonts/space-grotesk-700.woff2",
+   "/fonts/ibm-plex-sans-400.woff2",
+   "/fonts/ibm-plex-mono-500.woff2",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - navigation "Principal" [ref=e4]:
      - generic [ref=e5]:
        - button "Volver arriba" [ref=e6] [cursor=pointer]:
          - img [ref=e8]
          - generic [ref=e10]: Stabileo
        - generic [ref=e11]:
          - button "Básico" [ref=e12] [cursor=pointer]
          - button "PRO" [ref=e13] [cursor=pointer]
          - button "IA" [ref=e14] [cursor=pointer]
          - button "Educativo" [ref=e15] [cursor=pointer]
          - button "Precios" [ref=e16] [cursor=pointer]
          - link "Blog" [ref=e17] [cursor=pointer]:
            - /url: /@b7c3e3e/es/blog/
          - link "Investigación" [ref=e18] [cursor=pointer]:
            - /url: /@b7c3e3e/es/research/
        - generic [ref=e19]:
          - link "Repositorio en GitHub" [ref=e20] [cursor=pointer]:
            - /url: https://github.com/lambdaclass/stabileo
            - img [ref=e21]
            - generic [ref=e23]: GitHub
          - button "Idioma" [ref=e25] [cursor=pointer]:
            - generic [ref=e26]: Español
          - button "Abrir el editor" [ref=e28] [cursor=pointer]
    - region "Cálculo estructural, en una pestaña del navegador." [ref=e29]:
      - generic [ref=e30]:
        - generic [ref=e31]:
          - paragraph [ref=e32]:
            - generic [ref=e34]: "01"
            - generic [ref=e35]: LIBRE Y ABIERTO · CÁLCULO ESTRUCTURAL
          - heading "Cálculo estructural, en una pestaña del navegador." [level=1] [ref=e36]
          - paragraph [ref=e37]: "Una plataforma abierta de análisis estructural. El solver corre en tu máquina: sin instalar nada y sin licencias."
          - button "Abrir el editor" [ref=e39] [cursor=pointer]
          - link "Leer nuestro blog →" [ref=e40] [cursor=pointer]:
            - /url: /@b7c3e3e/es/blog/
          - generic [ref=e41]:
            - term [ref=e43]: Funciona en los navegadores actuales
            - term [ref=e45]: Código abierto
            - term [ref=e47]: Hecho en Argentina · FIUBA · Ergodic Group
        - figure "TRACCIÓN + COMPRESIÓN − CASI NULO ≈0 SIN DEFORMAR DEFORMADA · NORMALIZADA" [ref=e49]:
          - 'img "Una carga unitaria recorriendo un reticulado Pratt de seis paneles Reticulado Pratt de seis paneles simplemente apoyado: articulación fija en el nodo izquierdo del tablero y móvil en el derecho. Una única carga unitaria descendente recorre el tablero; entre nodos se reparte linealmente entre los dos adyacentes, así la carga total siempre vale uno. Las barras se colorean según el esfuerzo axial resuelto (rojo en tracción, azul en compresión, gris cuando el esfuerzo es casi nulo), con una única escala compartida por todas las posiciones. El contorno gris es el reticulado sin deformar; la deformada está normalizada para que se lea." [ref=e50]'
          - generic [ref=e104]:
            - generic [ref=e105]: TRACCIÓN +
            - generic [ref=e106]: COMPRESIÓN −
            - generic [ref=e107]: CASI NULO ≈0
            - generic [ref=e108]: SIN DEFORMAR
            - generic [ref=e109]: DEFORMADA · NORMALIZADA
    - region "Una calculadora de bolsillo de código abierto para ingeniería civil." [ref=e110]:
      - generic [ref=e111]:
        - paragraph [ref=e112]:
          - generic [ref=e114]: "01"
          - generic [ref=e115]: BÁSICO
        - generic [ref=e116]:
          - heading "Una calculadora de bolsillo de código abierto para ingeniería civil." [level=2] [ref=e117]
          - generic [ref=e118]: GRATIS, SIEMPRE
        - paragraph [ref=e119]: Modelás, cargás, resolvés y leés resultados en 2D y 3D, en el navegador.
        - list [ref=e120]:
          - listitem [ref=e121]: Resolvé estructuras de barras en 2D y en 3D.
          - listitem [ref=e122]: Analizá esfuerzos característicos y tensiones.
          - listitem [ref=e123]: "Probá las funciones de análisis avanzado: cinemático, tensiones en una sección y varias más."
          - listitem [ref=e124]: Cargá modelos desde plantillas de Excel, guardalos o compartilos con un link.
        - generic [ref=e125]:
          - article [ref=e126]:
            - img "Diagrama de momentos de una viga continua en el editor 2D." [ref=e128]
            - heading "Diagramas característicos 2D" [level=3] [ref=e130]
          - article [ref=e131]:
            - img "Panel de análisis de sección con el círculo de Mohr y el flujo de corte." [ref=e133]
            - heading "Análisis de tensiones para elementos 2D" [level=3] [ref=e135]
          - article [ref=e136]:
            - img "Pórtico espacial resuelto en el visor 3D." [ref=e138]
            - heading "Diagramas característicos 3D" [level=3] [ref=e140]
          - article [ref=e141]:
            - img "Tensiones sobre la sección de una barra en 3D." [ref=e143]
            - heading "Análisis de tensiones para elementos 3D" [level=3] [ref=e145]
    - region "Elementos finitos y modelos complejos." [ref=e146]:
      - generic [ref=e147]:
        - paragraph [ref=e148]:
          - generic [ref=e150]: "02"
          - generic [ref=e151]: PRO · CÁLCULO
        - generic [ref=e152]:
          - heading "Elementos finitos y modelos complejos." [level=2] [ref=e153]
          - generic [ref=e154]: EN DESARROLLO · GRATIS
        - paragraph [ref=e155]: Losas y tabiques, construcción por etapas, análisis no lineal y dinámica. Varias de estas capacidades ya funcionan; el módulo sigue en desarrollo.
        - figure "Importable desde planos de AutoCAD (DXF), plantillas de Excel o archivos BIM (IFC). Además de todo lo del Básico, calcula losas y tabiques, permite definir materiales y secciones compuestas con más detalle, resolver las uniones y exportar los resultados como planilla para la memoria de cálculo. Está en desarrollo, con acceso libre para quien quiera probarlo." [ref=e156]:
          - generic [ref=e157]:
            - img "Edificio de varios pisos modelado en PRO." [ref=e159]
            - img "Mapa de esfuerzo axial sobre la estructura de un edificio." [ref=e161]
          - generic [ref=e162]: Importable desde planos de AutoCAD (DXF), plantillas de Excel o archivos BIM (IFC). Además de todo lo del Básico, calcula losas y tabiques, permite definir materiales y secciones compuestas con más detalle, resolver las uniones y exportar los resultados como planilla para la memoria de cálculo. Está en desarrollo, con acceso libre para quien quiera probarlo.
    - region "Verificación normativa y diseño de elementos." [ref=e163]:
      - generic [ref=e164]:
        - paragraph [ref=e165]:
          - generic [ref=e167]: "03"
          - generic [ref=e168]: PRO · DISEÑO
        - generic [ref=e169]:
          - heading "Verificación normativa y diseño de elementos." [level=2] [ref=e170]
          - generic [ref=e171]: EN DESARROLLO · ACCESO LIBRE
        - paragraph [ref=e172]: Después de calcular, verificá y diseñá los elementos según el reglamento. Hoy verifica hormigón armado (CIRSOC 201) y acero (CIRSOC 301, experimental), y genera las cargas y combinaciones de CIRSOC 101, 102, 103 y 104; está organizado para sumar reglamentos de otros países.
        - link "Qué verifica hoy según CIRSOC →" [ref=e173] [cursor=pointer]:
          - /url: /@b7c3e3e/es/cirsoc/
        - article [ref=e175]:
          - img "Visor 3D del despiece de armaduras de una viga de hormigón." [ref=e177]
          - heading "Del cálculo al despiece" [level=3] [ref=e179]
    - region "Un agente que arma, revisa y explica modelos." [ref=e180]:
      - generic [ref=e181]:
        - paragraph [ref=e182]:
          - generic [ref=e184]: "04"
          - generic [ref=e185]: STABILEO IA
        - generic [ref=e186]:
          - generic [ref=e187]:
            - generic [ref=e188]:
              - heading "Un agente que arma, revisa y explica modelos." [level=2] [ref=e189]
              - generic [ref=e190]: EN DESARROLLO
            - paragraph [ref=e191]: Trabaja sobre el mismo modelo estructurado y el mismo solver que usás vos. La IA propone; el solver decide. Nunca al revés.
          - figure "Propone el cambio; vos lo aplicás" [ref=e192]:
            - 'img "Panel de Stabileo IA: un pedido en lenguaje natural y el cambio que la IA propone antes de aplicarlo." [ref=e194]'
            - generic [ref=e195]: Propone el cambio; vos lo aplicás
    - region "Cómo verificamos los resultados, y dónde terminan las verificaciones." [ref=e196]:
      - generic [ref=e197]:
        - paragraph [ref=e198]:
          - generic [ref=e200]: "05"
          - generic [ref=e201]: VERIFICACIÓN
        - heading "Cómo verificamos los resultados, y dónde terminan las verificaciones." [level=2] [ref=e202]
        - paragraph [ref=e203]: "El solver corre en tu computadora y calcula los resultados del análisis estructural. Lo comparamos con siete programas de elementos finitos y con resultados publicados, y probamos que respete los invariantes físicos. Para los resultados que lo admiten, el solver intenta además en segundo plano un certificado: una cota del error numérico cuya matemática central, en el análisis lineal, el modal y el colapso plástico, está demostrada en Lean. Una cota acota el error de resolver el sistema armado: no prueba que el modelo sea el correcto. Cada error que encontramos se evalúa y, si pudo afectar resultados ya usados, se publica como aviso."
        - paragraph [ref=e204]:
          - link "Cómo verificamos, y los límites →" [ref=e205] [cursor=pointer]:
            - /url: /@b7c3e3e/es/blog/how-stabileo-checks-its-results/
          - link "Avisos de seguridad →" [ref=e206] [cursor=pointer]:
            - /url: /@b7c3e3e/es/blog/safety-advisories/
    - region "El docente arma el ejercicio; el alumno lo resuelve." [ref=e207]:
      - generic [ref=e208]:
        - paragraph [ref=e209]:
          - generic [ref=e211]: "06"
          - generic [ref=e212]: EDUCATIVO
        - generic [ref=e213]:
          - heading "El docente arma el ejercicio; el alumno lo resuelve." [level=2] [ref=e214]
          - generic [ref=e215]: EN DESARROLLO
        - paragraph [ref=e216]: El ejercicio se escribe dentro de la app y se reparte como un link. El alumno lo resuelve sin el resultado a la vista, y las respuestas vuelven al docente.
        - article [ref=e218]:
          - 'img "Un ejercicio en el modo educativo: el pórtico a la izquierda y, a la derecha, los pasos con los campos de reacciones que el alumno completa." [ref=e220]'
          - heading "Un ejercicio de Estática" [level=3] [ref=e222]
    - region "Cómo pensamos sostener un proyecto abierto" [ref=e223]:
      - generic [ref=e224]:
        - paragraph [ref=e225]:
          - generic [ref=e227]: "07"
          - generic [ref=e228]: PRECIOS
        - heading "Cómo pensamos sostener un proyecto abierto" [level=2] [ref=e229]
        - paragraph [ref=e230]: "Stabileo es open source y se construye con la comunidad: el código está a la vista, se puede auditar y cualquiera puede participar. Queremos que las herramientas de cálculo tradicionales sean de acceso libre, y que con el tiempo las de diseño específico y Stabileo IA ayuden a financiar el proyecto. Para las universidades, el programa es gratuito en todos los casos."
        - table [ref=e232]:
          - rowgroup [ref=e233]:
            - row "Precios Empresas y particulares Universidades" [ref=e234]:
              - columnheader "Precios" [ref=e235]:
                - generic [ref=e236]: Precios
              - columnheader "Empresas y particulares" [ref=e237]
              - columnheader "Universidades" [ref=e238]
          - rowgroup [ref=e239]:
            - row "Básico Gratis Gratis" [ref=e240]:
              - rowheader "Básico" [ref=e241]
              - cell "Gratis" [ref=e242]
              - cell "Gratis" [ref=e243]
            - row "PRO · Cálculo Gratis Gratis" [ref=e244]:
              - rowheader "PRO · Cálculo" [ref=e245]
              - cell "Gratis" [ref=e246]
              - cell "Gratis" [ref=e247]
            - row "PRO · Diseño normativo Gratis durante el desarrollo* Gratis" [ref=e248]:
              - rowheader "PRO · Diseño normativo" [ref=e249]
              - cell "Gratis durante el desarrollo*" [ref=e250]:
                - text: Gratis durante el desarrollo
                - superscript [ref=e251]: "*"
              - cell "Gratis" [ref=e252]
            - row "Stabileo IA Pago por token**" [ref=e253]:
              - rowheader "Stabileo IA" [ref=e254]
              - cell "Pago por token**" [ref=e255]:
                - text: Pago por token
                - superscript [ref=e256]: "**"
              - cell [ref=e257]
            - row "Educativo Gratis" [ref=e258]:
              - rowheader "Educativo" [ref=e259]
              - cell [ref=e260]
              - cell "Gratis" [ref=e261]
        - paragraph [ref=e262]: "* Los módulos de diseño van a ser gratuitos para quienes participen del desarrollo de Stabileo y para las universidades públicas."
        - paragraph [ref=e263]: "** Cuando esté disponible, Stabileo IA será una función paga por el costo de sostenerla. A las universidades y a quienes participen del desarrollo queremos darles la opción de conectar la API del modelo de lenguaje que prefieran, para que puedan probarla por su cuenta."
        - paragraph [ref=e264]: El repositorio está abierto. Los aportes, los reportes y las discusiones de diseño son bienvenidos.
    - region "Accedé a nuestro blog" [ref=e265]:
      - generic [ref=e267]:
        - paragraph [ref=e268]:
          - generic [ref=e270]: BLOG
        - heading "Accedé a nuestro blog" [level=2] [ref=e271]
        - paragraph [ref=e272]: Notas largas sobre cómo funciona el solver, qué verifican realmente los módulos normativos y las decisiones detrás de todo eso.
        - article [ref=e273]:
          - paragraph [ref=e274]: LA ÚLTIMA
          - 'heading "El mismo modelo, los mismos números: determinismo y trazabilidad" [level=3] [ref=e275]':
            - 'link "El mismo modelo, los mismos números: determinismo y trazabilidad" [ref=e276] [cursor=pointer]':
              - /url: /@b7c3e3e/es/blog/same-model-same-numbers/
          - paragraph [ref=e277]: 22 de octubre de 2026 · 3 min de lectura
          - paragraph [ref=e278]: Dos cálculos del mismo modelo en la misma sesión podían diferir en los últimos dígitos. Por qué pasaba, cómo lo corregimos y cómo cada memoria de cálculo dice ahora con qué versión y qué datos se obtuvo, para que cualquiera pueda reproducirla.
          - link "Leer esta nota →" [ref=e279] [cursor=pointer]:
            - /url: /@b7c3e3e/es/blog/same-model-same-numbers/
        - link "Ir al blog" [ref=e281] [cursor=pointer]:
          - /url: /@b7c3e3e/es/blog/
    - contentinfo [ref=e282]:
      - generic [ref=e283]:
        - generic [ref=e284]:
          - img [ref=e286]
          - generic [ref=e288]:
            - paragraph [ref=e289]: Stabileo
            - paragraph [ref=e290]: Análisis estructural de código abierto que corre en tu navegador.
        - generic [ref=e291]:
          - navigation "Pie de página" [ref=e292]:
            - link "Documentación" [ref=e293] [cursor=pointer]:
              - /url: https://github.com/lambdaclass/stabileo/blob/main/docs/README.md
            - link "GitHub" [ref=e294] [cursor=pointer]:
              - /url: https://github.com/lambdaclass/stabileo
            - link "Blog" [ref=e295] [cursor=pointer]:
              - /url: /@b7c3e3e/es/blog/
            - link "CIRSOC" [ref=e296] [cursor=pointer]:
              - /url: /@b7c3e3e/es/cirsoc/
            - link "Confiabilidad" [ref=e297] [cursor=pointer]:
              - /url: /@b7c3e3e/es/reliability/
            - link "Alternativa a SAP2000" [ref=e298] [cursor=pointer]:
              - /url: /@b7c3e3e/es/sap2000-alternative/
            - button "Abrir el editor" [ref=e299] [cursor=pointer]
          - list "Seguinos" [ref=e300]:
            - listitem [ref=e301]:
              - link "stabileoapp" [ref=e302] [cursor=pointer]:
                - /url: https://www.instagram.com/stabileoapp/
                - img [ref=e304]
                - generic [ref=e306]: stabileoapp
            - listitem [ref=e307]:
              - link "@stabileoapp" [ref=e308] [cursor=pointer]:
                - /url: https://x.com/Stabileoapp
                - img [ref=e310]
                - generic [ref=e312]: "@stabileoapp"
            - listitem [ref=e313]:
              - link "Stabileo" [ref=e314] [cursor=pointer]:
                - /url: https://www.linkedin.com/company/stabileo
                - img [ref=e316]
                - generic [ref=e318]: Stabileo
            - listitem [ref=e319]:
              - link "Discord" [ref=e320] [cursor=pointer]:
                - /url: https://discord.gg/Q53rp7FKXA
                - img [ref=e322]
                - generic [ref=e324]: Discord
            - listitem [ref=e325]:
              - link "Ergodic Group" [ref=e326] [cursor=pointer]:
                - /url: https://ergodicgroup.com/
                - generic [ref=e327]: Ergodic Group
      - paragraph [ref=e329]: © 2026 Stabileo. Software libre bajo AGPL-3.0.
    - button "Contacto y redes" [ref=e331]:
      - img [ref=e332]
  - region "You’re viewing the version of October 28, 2026" [ref=e337]:
    - generic [ref=e338]:
      - text: You’re viewing the version of October 28, 2026 (
      - code [ref=e339]: b7c3e3e
      - text: ).
    - link "The latest version is here" [ref=e340] [cursor=pointer]:
      - /url: http://127.0.0.1:5196/
    - link "What changed since (GitHub)" [ref=e341] [cursor=pointer]:
      - /url: https://github.com/lambdaclass/stabileo/compare/b7c3e3e07076dbc51cff44764a64511be8886962...main
    - button "Hide" [ref=e342] [cursor=pointer]: ×
```

# Test source

```ts
  1  | import { test, expect, type Page } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * A snapshot build (`/@<commit>/`, web/scripts/snapshot.ts) under `vite preview`: every page, asset,
  5  |  * worker and WASM the site loads comes from under the prefix, navigation stays under it, and the
  6  |  * version banner points at the latest page and at the compare view on GitHub.
  7  |  */
  8  | const P = process.env.SNAPSHOT_PREFIX!; // '/@abc1234/'
  9  | const SHORT = P.slice(2, -1);
  10 | 
  11 | /** Every same-origin request path, to check none leaves the snapshot (the backend's /api excepted). */
  12 | function watch(page: Page, baseURL: string | undefined) {
  13 |   const origin = new URL(baseURL!).origin;
  14 |   const outside: string[] = [];
  15 |   page.on('request', (r) => {
  16 |     const u = new URL(r.url());
  17 |     if (u.origin !== origin) return;
  18 |     if (!u.pathname.startsWith(P) && !u.pathname.startsWith('/api/')) outside.push(u.pathname);
  19 |   });
  20 |   return outside;
  21 | }
  22 | 
  23 | test('the research page is served under the prefix, with the version banner', async ({ page, baseURL }) => {
  24 |   const outside = watch(page, baseURL);
  25 |   const res = await page.goto(`${P}en/research/fracture/shauer-2025/`);
  26 |   expect(res?.status()).toBe(200);
  27 |   await expect(page.getByRole('heading', { name: 'Phase-field fracture of a notched plate' })).toBeVisible();
  28 |   await expect(page).toHaveURL(new RegExp(`${P}en/research/fracture/shauer-2025/$`));
  29 | 
  30 |   const banner = page.locator('#stabileo-snapshot-banner');
  31 |   await expect(banner).toContainText(`(${SHORT})`);
  32 |   await expect(banner).toContainText('You’re viewing the version of');
  33 |   const latest = banner.getByRole('link', { name: 'The latest version is here' });
  34 |   expect(new URL((await latest.getAttribute('href'))!).pathname).toBe('/en/research/fracture/shauer-2025/');
  35 |   expect(await banner.getByRole('link', { name: /What changed since/ }).getAttribute('href')).toMatch(
  36 |     new RegExp(`^https://github.com/lambdaclass/stabileo/compare/${SHORT}[0-9a-f]*\\.\\.\\.main$`),
  37 |   );
  38 | 
  39 |   // Every root-relative link the page renders names the snapshot.
  40 |   const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  41 |   expect(hrefs.length).toBeGreaterThan(5);
  42 |   expect(hrefs.filter((h) => !h.startsWith(P))).toEqual([]);
  43 | 
  44 |   // The research WASM, in its worker, from the snapshot.
  45 |   const wasm: string[] = [];
  46 |   page.on('request', (r) => {
  47 |     if (r.url().endsWith('phasefield_bg.wasm')) wasm.push(new URL(r.url()).pathname);
  48 |   });
  49 |   await page.getByLabel('Mesh').selectOption('coarse');
  50 |   await page.getByRole('button', { name: 'Run', exact: true }).click();
  51 |   await expect.poll(async () => Number(await page.locator('.rs-out').getAttribute('data-steps')), { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  52 |   expect(wasm).toEqual([`${P}research-wasm/shauer-2025/phasefield_bg.wasm`]);
  53 |   expect(outside).toEqual([]);
  54 | });
  55 | 
  56 | test('navigation between public pages stays in the snapshot', async ({ page, baseURL }) => {
  57 |   const outside = watch(page, baseURL);
  58 |   await page.goto(`${P}es/research/`);
  59 |   await expect(page.getByRole('heading', { name: 'Stabileo Research' })).toBeVisible();
  60 |   await expect(page.locator('#stabileo-snapshot-banner')).toContainText('Estás viendo la versión del');
  61 |   await page.getByRole('link', { name: /experiment|experimento/i }).first().click();
  62 |   await expect(page).toHaveURL(new RegExp(`${P}es/research/fracture/shauer-2025/$`));
  63 |   await expect(page.locator('#stabileo-snapshot-banner a').first()).toHaveAttribute('href', /\/es\/research\/fracture\/shauer-2025\/$/);
  64 |   await page.goBack();
  65 |   await expect(page).toHaveURL(new RegExp(`${P}es/research/$`));
  66 |   await page.goto(P);
  67 |   await expect(page.locator('.landing')).toBeVisible();
> 68 |   expect(outside).toEqual([]);
     |                   ^ Error: expect(received).toEqual(expected) // deep equality
  69 | });
  70 | 
  71 | test('the application mounts under the prefix and loads the engine from it', async ({ page, baseURL }) => {
  72 |   const outside = watch(page, baseURL);
  73 |   const wasm: { path: string; status: number; type: string }[] = [];
  74 |   page.on('response', (r) => {
  75 |     if (/\.wasm$/.test(new URL(r.url()).pathname)) wasm.push({ path: new URL(r.url()).pathname, status: r.status(), type: r.headers()['content-type'] ?? '' });
  76 |   });
  77 |   const res = await page.goto(`${P}app/basic`);
  78 |   expect(res?.status()).toBe(200);
  79 |   await expect(page.getByRole('button', { name: 'Solve', exact: true }).first()).toBeVisible({ timeout: 60_000 });
  80 |   await expect(page).toHaveURL(new RegExp(`${P}app/basic`));
  81 |   await expect.poll(() => wasm.length, { timeout: 60_000 }).toBeGreaterThan(0);
  82 |   for (const w of wasm) {
  83 |     expect(w.path.startsWith(`${P}assets/`)).toBe(true);
  84 |     expect(w.status).toBe(200);
  85 |   }
  86 |   await expect(page.locator('#stabileo-snapshot-banner')).toContainText(SHORT);
  87 |   expect(outside).toEqual([]);
  88 | });
  89 | 
```