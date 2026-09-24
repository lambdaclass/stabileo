<p align="center">
  <img src="docs/brand/stabileo-mark.svg" alt="Stabileo" width="132" />
</p>

<h1 align="center">Stabileo</h1>

<p align="center">
  <strong>Cálculo estructural, en una pestaña del navegador.</strong><br>
  Una plataforma abierta de análisis estructural. El solver corre en tu máquina:
  sin instalar nada, sin licencias y sin cuenta.
</p>

<p align="center">
  <a href="https://stabileo.com"><strong>Abrir el editor</strong></a> ·
  <a href="docs/guide/es/README.md"><strong>Leer la guía</strong></a> ·
  <a href="https://stabileo.com/es/blog/">Blog</a> ·
  <a href="README.md">Read in English</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="Licencia"></a>
  <a href="https://github.com/lambdaclass/stabileo/actions/workflows/ci.yml"><img src="https://github.com/lambdaclass/stabileo/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center">
  <img src="docs/screenshots/pro-building-es.webp" alt="Un edificio de hormigón armado de siete pisos en Stabileo PRO, con los momentos flectores de las losas como mapa de color" width="100%" />
</p>

---

## Qué es

Stabileo es un programa de cálculo estructural que funciona en cualquier navegador actual. Modelás,
cargás, resolvés y leés resultados en 2D y en 3D. El motor de cálculo está escrito en Rust y
compilado a WebAssembly, así que corre en tu propia computadora: el modelo no se manda a un
servidor para calcularlo.

Nació en los cursos de estructuras de la [FIUBA](http://www.fi.uba.ar/) (Universidad de Buenos
Aires) y conserva ese origen: además de dar el resultado, **muestra el desarrollo**: el grado de
hiperestaticidad, la matriz de rigidez paso a paso, qué teoría de torsión corresponde a una
sección y por qué.

La interfaz está en **español, inglés y portugués**.

## Los modos

| Modo | Estado | Qué hace |
|------|--------|----------|
| **Básico** | Disponible | Estructuras de barras en 2D y en 3D. Diagramas de esfuerzo axil, corte y momento, tensiones y funciones avanzadas: análisis cinemático, análisis de sección, segundo orden, pandeo, análisis modal, colapso plástico, líneas de influencia y el método de las rigideces paso a paso. Los modelos se cargan desde plantillas de Excel, se guardan en un archivo o viajan en un link. |
| **PRO** | En desarrollo | Elementos finitos y modelos complejos: losas y tabiques como placas y cáscaras, vínculos, generación de cargas según norma, importación desde AutoCAD (DXF) o Excel, y análisis dinámico, por etapas y no lineal. |
| **Educativo** | En desarrollo | El docente arma el ejercicio dentro de la app y lo reparte como un link. El alumno lo resuelve sin el resultado a la vista y le devuelve sus respuestas en un archivo o un código corto. |
| **Stabileo IA** | En desarrollo | Un agente que se está construyendo para armar, revisar y explicar modelos, sobre el mismo modelo estructurado y el mismo solver que usás vos. La IA propone; el solver decide. |

<table>
  <tr>
    <td width="50%"><img src="docs/guide/es/img/basic-2d-moments.webp" alt="Diagrama de momentos de un pórtico en Básico 2D" /></td>
    <td width="50%"><img src="docs/guide/es/img/basic-kinematic.webp" alt="Análisis cinemático que encuentra un mecanismo que la fórmula del grado no ve" /></td>
  </tr>
  <tr>
    <td><sub>Básico 2D: el diagrama de momentos de un pórtico, con la tabla de resultados.</sub></td>
    <td><sub>Análisis cinemático: la fórmula del grado da cero y la matriz de rigidez encuentra el mecanismo.</sub></td>
  </tr>
</table>

## Documentación

**La [guía de Stabileo](docs/guide/es/README.md)** explica cómo usar cada modo y la teoría que hay
detrás. Está escrita para leerse como un apunte, y no hace falta saber de GitHub ni de programación
para recorrerla: se abre un capítulo y se sigue con los enlaces del final de cada página.

| | Español | English |
|---|---|---|
| Índice | [Guía](docs/guide/es/README.md) | [Guide](docs/guide/en/README.md) |
| 1 | [Primeros pasos](docs/guide/es/01-primeros-pasos.md) | [Getting started](docs/guide/en/01-getting-started.md) |
| 2 | [Modo Básico en 2D](docs/guide/es/02-basico-2d.md) | [Basic mode in 2D](docs/guide/en/02-basic-2d.md) |
| 3 | [Modo Básico en 3D](docs/guide/es/03-basico-3d.md) | [Basic mode in 3D](docs/guide/en/03-basic-3d.md) |
| 4 | [Funciones avanzadas](docs/guide/es/04-funciones-avanzadas.md) | [Advanced tools](docs/guide/en/04-advanced-tools.md) |
| 5 | [Modo PRO](docs/guide/es/05-pro.md) | [PRO mode](docs/guide/en/05-pro.md) |
| 6 | [Fundamentos teóricos](docs/guide/es/06-fundamentos-teoricos.md) | [Theory](docs/guide/en/06-theory.md) |

La documentación técnica y para colaboradores (referencia del solver, verificación, benchmarks,
hojas de ruta) está en inglés y se indexa en [docs/README.md](docs/README.md).

## Por qué existe

Muchos paquetes comerciales de cálculo estructural cuestan miles de dólares por año, funcionan en
un solo sistema operativo, necesitan instalación y servidores de licencias, y son cerrados. Los
solvers de código abierto como [OpenSees](https://opensees.berkeley.edu/) son potentes, pero se
manejan con scripts y no tienen una interfaz visual propia.

- **Cálculo local.** El solver corre en tu navegador mediante WebAssembly. Abrís
  [stabileo.com](https://stabileo.com) y empezás, sin instalar nada y sin mandar el modelo a un
  servidor.
- **Recálculo en vivo.** Con el cálculo en tiempo real activado, si movés un nodo, cambiás una
  carga o una sección, el modelo se vuelve a resolver y los resultados se actualizan.
- **Resultados explicados.** Las herramientas avanzadas muestran fórmulas, datos y pasos
  intermedios. El análisis cinemático, el análisis de sección y el método de las rigideces paso a
  paso dejan ver *por qué* un resultado es el que es, incluso cuando la fórmula que te enseñaron no
  aplica.
- **Código abierto.** El motor y la interfaz se publican bajo AGPL-3.0 y pueden auditarse y
  modificarse.

## El blog

Notas largas sobre cómo funciona el solver y las decisiones detrás, en español, inglés y
portugués. Cada número se calcula con el motor antes de escribir el texto, y varias notas tienen
el editor embebido sobre el modelo del que hablan. Dos para empezar:

- [Lo que el software gratuito calcula, y lo que no te explica](https://stabileo.com/es/blog/conceptual-side-advanced-tools/): dónde se detienen las herramientas gratuitas
- [La frontera de determinismo](https://stabileo.com/es/blog/the-determinism-boundary/): por qué un agente de IA no debe calcular

**[Leer todas las notas en el blog →](https://stabileo.com/es/blog/)**

## Cómo está hecho

- **Motor:** Rust, compilado a WebAssembly. Método de las rigideces para barras, elementos MITC4 y
  DKT para placas y cáscaras, factorización de Cholesky dispersa para modelos grandes.
- **Interfaz:** Svelte 5 y TypeScript, Three.js para el 3D, KaTeX para las ecuaciones del paso a
  paso.
- **Verificación:** contrastado con soluciones analíticas, benchmarks de NAFEMS, el ANSYS
  Verification Manual, Code_Aster y problemas de libro. Ver [BENCHMARKS.md](docs/BENCHMARKS.md).

<details>
<summary><strong>Qué puede resolver el motor</strong></summary>

El motor implementa más de lo que cualquier modo expone hoy; los modos de arriba dicen qué se puede
usar desde la interfaz.

- Estática lineal 2D y 3D, segundo orden (P-Δ), pandeo lineal, modal, espectral, historia en el
  tiempo, respuesta armónica y cargas móviles
- Análisis no lineal corrotacional y de material, análisis plástico, elementos viga-columna de
  fibras
- Construcción por etapas, pretensado y postesado, cables, contacto y gap, interacción
  suelo-estructura no lineal
- Imperfecciones iniciales, tensiones residuales, fluencia y retracción
- Cáscaras: MITC4 (ANS + EAS-7), MITC9, cáscara sólida SHB8-ANS y cáscaras curvas
- Reducción de modelos de Guyan y de Craig-Bampton
- Combinaciones de carga, envolventes, análisis de sección, recuperación de tensiones y
  diagnóstico cinemático

</details>

## Correrlo localmente

```bash
git clone https://github.com/lambdaclass/stabileo.git
cd stabileo/web
npm install
npm run wasm      # compila el motor Rust en web/src/lib/wasm (requiere Rust y wasm-pack)
npm run dev       # http://localhost:4000
```

Requiere Node.js 18 o superior. Los detalles del build y de los tests están en el
[README en inglés](README.md#run-it-locally).

## Colaborar

Stabileo se construye a la vista, con quienes lo usan. Los reportes, las ideas, las discusiones y
el código son bienvenidos.

**El mejor lugar para empezar es nuestro [Discord](https://discord.gg/Q53rp7FKXA)**: ahí charlamos
sobre el proyecto, respondemos dudas y discutimos lo que viene, en español y en inglés. Sumate y
saludá.

Todos los canales están reunidos en **[linktr.ee/stabileo](https://linktr.ee/stabileo)**:

| Canal | Idioma | Para qué |
|---|---|---|
| [Discord](https://discord.gg/Q53rp7FKXA) | Español · inglés | Charlar y participar del proyecto |
| [WhatsApp](https://wa.me/5491138563881) | Español · inglés | Contacto directo con el equipo |
| [X](https://x.com/Stabileoapp) | Inglés | Novedades y actualizaciones |
| [Instagram](https://www.instagram.com/stabileoapp/) | Español | Novedades de funciones |
| [LinkedIn](https://www.linkedin.com/company/stabileo) | Español | Novedades del proyecto |

**Código.** Los pull requests son bienvenidos. Para cambios grandes, abrí primero un *issue* para
discutir el enfoque. La [documentación técnica](docs/README.md) es el punto de partida.

## Seguridad

Para reportar una vulnerabilidad, escribí a security@lambdaclass.com.

## Licencia

[AGPL-3.0](LICENSE)

## Hecho por

- **Bautista Chesta**: Ingeniero civil (FIUBA), UX/UI y gestión del proyecto
- **Diego Kingston**: Doctor en Ingeniería (UBA), integración producto–solver
- **Federico Carrone**: Fundador de [Lambda Class](https://lambdaclass.com), líder del solver

Con aportes de matemáticos, físicos, ingenieros en computación y científicos de la computación de
[Lambda Class](https://lambdaclass.com).
