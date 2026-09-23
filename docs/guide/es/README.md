# Guía de Stabileo

**Stabileo** es un programa de cálculo estructural que funciona en el navegador. No hay que
instalar nada ni crear una cuenta: se abre [stabileo.com](https://stabileo.com) y se empieza a
modelar. El cálculo corre en tu propia computadora, así que tus modelos no salen de ella.

Esta guía explica qué hace cada parte del programa y, sobre todo, **la teoría que hay detrás**.
Está pensada para leerse de corrido, como un apunte, sin necesidad de saber programar ni de
conocer GitHub: cada página tiene al final los enlaces a la anterior y a la siguiente.

> *[Read this guide in English](../en/README.md)*

## Por dónde empezar

| | Página | Qué vas a encontrar |
|---|---|---|
| 1 | [Primeros pasos](01-primeros-pasos.md) | La pantalla, los dos modos, tu primer modelo en cinco minutos, cómo guardar y compartir. |
| 2 | [Modo Básico en 2D](02-basico-2d.md) | Nodos, barras, articulaciones, apoyos, cargas, materiales, secciones, combinaciones y resultados en el plano. |
| 3 | [Modo Básico en 3D](03-basico-3d.md) | Qué cambia al pasar al espacio: seis grados de libertad, ejes locales, torsión y cómo volver a 2D. |
| 4 | [Funciones avanzadas del modo Básico](04-funciones-avanzadas.md) | Análisis cinemático, análisis de sección, segundo orden, pandeo, dinámica, colapso plástico, líneas de influencia y el método de las rigideces paso a paso. |
| 5 | [Modo PRO](05-pro.md) | Elementos finitos: losas y tabiques, vínculos, generación de cargas, importación de planos y los análisis avanzados. |
| 6 | [Fundamentos teóricos](06-fundamentos-teoricos.md) | Convenciones, el método de las rigideces, la viga de Euler-Bernoulli, las teorías de tensiones y los elementos finitos de placa y cáscara. |

Si nunca usaste el programa, empezá por la 1. Si venís a entender por qué un resultado da lo que
da, la 6 se puede leer sola.

## Los modos, en una línea

- **Básico** — estructuras de barras en 2D y en 3D. Es gratuito, está terminado y es el que se
  usa en los cursos. Además de calcular, **muestra el desarrollo**: el grado de hiperestaticidad,
  la matriz de rigidez paso a paso, las tensiones en la sección con la fórmula que corresponde.
- **PRO** — elementos finitos y modelos complejos: losas y tabiques como placas y cáscaras,
  vínculos, generación de cargas, importación desde AutoCAD, Excel o IFC, y análisis dinámicos
  y no lineales. Está en desarrollo, con acceso libre para quien quiera probarlo.
- **Educativo** — el docente arma un ejercicio dentro de la app y lo reparte como un link; el
  alumno lo resuelve sin ver el resultado y las respuestas vuelven al docente. Se activa desde
  **Ajustes**.

## Para seguir leyendo

- **[El blog](https://stabileo.com/es/blog)** tiene notas largas sobre temas puntuales, con
  números calculados por el programa y el editor embebido: por ejemplo,
  [¿barras o elementos finitos?](https://stabileo.com/es/blog/bars-or-finite-elements/) o
  [qué teoría de torsión aplica](https://stabileo.com/es/blog/torsion-bredt-saint-venant/).
- **¿Encontraste un error en la guía o en el programa?** Usá el botón de contacto de la app o
  abrí un *issue* en [GitHub](https://github.com/lambdaclass/stabileo/issues).

---

[Siguiente: Primeros pasos →](01-primeros-pasos.md)
