import type { Post } from '../types';
import { flexureExampleRows, flexureExampleSteps } from '../flexure-example';

export const cirsoc201Flexure: Post = {
  "slug": "verificacion-flexion-cirsoc-201",
  "date": "2026-08-26",
  "order": 3,
  "authors": [
    "Bautista Chesta"
  ],
  "tagKeys": [
    "blog.tag.cirsoc",
    "blog.tag.concrete"
  ],
  "i18n": {
    "es": {
      "title": "Verificación a flexión según CIRSOC 201, paso a paso",
      "excerpt": "Casi todos recuerdan φMn ≥ Mu. Esa es la última línea de la verificación, no la verificación. Los pasos que deciden el resultado son otros, y uno hace que φ no valga 0,9.",
      "blocks": [
        {
          "k": "p",
          "t": "Verificar una viga a flexión se resume, en la memoria de casi todos, en una desigualdad: φMn ≥ Mu. Es cierto, y es la última línea. Lo que decide el resultado pasa antes, en pasos que rara vez se miran con atención porque parecen trámite."
        },
        {
          "k": "p",
          "t": "Esto es lo que devuelve el módulo CIRSOC 201 de Stabileo para una viga de 20×40 cm, H-25, con acero fy 420, 25 mm de recubrimiento y estribos de 8, bajo un momento de 60 kN·m:"
        },
        {
          "k": "ol",
          "items": flexureExampleSteps("Armadura tracción: 2 Ø20 (6,28 cm²)")
        },
        {
          "k": "p",
          "t": "Diez pasos. El décimo es el que todos recuerdan. Los que deciden son el tercero y el noveno."
        },
        {
          "k": "h",
          "t": "Paso 3: el mínimo gobierna más seguido de lo que parece"
        },
        {
          "k": "p",
          "t": "El artículo 9.6.1.2 pide una armadura mínima de flexión igual al mayor entre 0,25·√f'c/fy·bw·d y 1,4/fy·bw·d. Se suele leer como un piso que casi nunca se toca. En vigas de vivienda se toca todo el tiempo."
        },
        {
          "k": "table",
          "caption": "La misma viga 20×40 de H-25, con momentos crecientes: quién decide la armadura.",
          "head": [
            "Mu [kN·m]",
            "As por resistencia [cm²]",
            "As,mín [cm²]",
            "Gobierna"
          ],
          "rows": [
            [
              "15",
              "1.12",
              "2.39",
              "el mínimo"
            ],
            [
              "30",
              "2.28",
              "2.39",
              "el mínimo"
            ],
            [
              "60",
              "4.73",
              "2.39",
              "la resistencia"
            ],
            [
              "90",
              "7.38",
              "2.39",
              "la resistencia"
            ]
          ]
        },
        {
          "k": "p",
          "t": "El cruce está en Mu = 31,5 kN·m. Por debajo de ese momento, dimensionar por resistencia no sirve de nada: la sección va a llevar 2,39 cm² igual. Vale la pena saber de qué lado del cruce está una viga antes de discutir su armadura."
        },
        {
          "k": "h",
          "t": "Y el mínimo casi nunca depende del hormigón"
        },
        {
          "k": "p",
          "t": "De las dos ramas del artículo, la de √f'c sólo supera a la otra cuando el hormigón es bastante bueno."
        },
        {
          "k": "table",
          "caption": "Las dos ramas del mínimo, para fy 420, en por mil.",
          "head": [
            "Hormigón",
            "0,25·√f'c/fy",
            "1,4/fy",
            "Gobierna"
          ],
          "rows": [
            [
              "H-20",
              "2.6620",
              "3.3333",
              "1,4/fy"
            ],
            [
              "H-25",
              "2.9762",
              "3.3333",
              "1,4/fy"
            ],
            [
              "H-30",
              "3.2603",
              "3.3333",
              "1,4/fy"
            ],
            [
              "H-35",
              "3.5215",
              "3.3333",
              "√f'c"
            ]
          ]
        },
        {
          "k": "p",
          "t": "El cruce está en f'c = 31,36 MPa. Para todo el rango que se usa en vivienda (H-20, H-25, H-30), la armadura mínima no depende del hormigón: sale de 1,4/fy y nada más. Subir de H-20 a H-30 no baja el mínimo ni un centímetro cuadrado."
        },
        {
          "k": "h",
          "t": "Paso 9: φ no vale 0,9 porque sí"
        },
        {
          "k": "p",
          "t": "El coeficiente de reducción se aprende como 0,90 para flexión y se usa como constante. No lo es. Sale de la deformación de la armadura traccionada en el estado último, y el módulo lo dice en el paso 9: εt ≥ 5‰ → sección controlada por tracción → φ = 0,90. Si la sección lleva más armadura, εt baja y φ con ella."
        },
        {
          "k": "table",
          "caption": "La misma viga, cargada cada vez más. εt y φ salen de los pasos 8 y 9.",
          "head": [
            "Mu [kN·m]",
            "Armadura",
            "εt [‰]",
            "φ",
            "φMn [kN·m]",
            "Ductilidad"
          ],
          "rows": flexureExampleRows("Cumple", "No cumple")
        },
        {
          "k": "p",
          "t": "La sección con 2 Ø32 no cumple: su deformación de tracción es inferior al mínimo exigido. Reducir φ no satisface la verificación de ductilidad. Rediseñe la sección o su armadura."
        },
        {
          "k": "quote",
          "t": "La sección con 2 Ø32 no cumple: su deformación de tracción es inferior al mínimo exigido. Reducir φ no satisface la verificación de ductilidad. Rediseñe la sección o su armadura."
        },
        {
          "k": "h",
          "t": "Por qué se pone armadura de compresión"
        },
        {
          "k": "p",
          "t": "La armadura de compresión puede ser necesaria al alcanzar el límite de ductilidad. No espere hasta que el acero de tracción deje de fluir; verifique la sección rediseñada con las profundidades reales de las barras."
        },
        {
          "k": "p",
          "t": "O sea que la armadura de compresión está ahí para devolverle ductilidad a la sección y recuperar el coeficiente. La capacidad viene después, como resultado."
        },
        {
          "k": "note",
          "t": "La armadura de compresión puede ser necesaria al alcanzar el límite de ductilidad. No espere hasta que el acero de tracción deje de fluir; verifique la sección rediseñada con las profundidades reales de las barras."
        },
        {
          "k": "h",
          "t": "Probalo sobre una viga de verdad"
        },
        {
          "k": "p",
          "t": "Acá abajo está el modelo: una viga simplemente apoyada de 5 m, 20×40, H-25, con 12 kN/m de carga permanente y 8 kN/m de sobrecarga, más su peso propio. Abre en el armado por planillas del PRO, con CIRSOC 201-2025 como norma."
        },
        {
          "k": "img",
          "base": "blog/cirsoc-201-sheets",
          "w": 1600,
          "h": 1000,
          "alt": "Stabileo PRO, armado por planillas con CIRSOC 201-2025, la planilla de vigas abierta en V1 después de calcular y dimensionar. La fila propone 2 Ø25 corridos abajo, 2 Ø16 corridos arriba y estribos Ø8 c/18, con una relación de 0,80 y estado Verifica. Abajo, la elevación con las marcas de las barras y las envolventes de momento y corte contra la capacidad.",
          "caption": "La viga de abajo en la planilla de vigas, después de «Dimensionar armaduras»: los 2 Ø25 que propone Stabileo cierran en 0,80."
        },
        {
          "k": "embed",
          "mode": "pro",
          "query": "example=rc-beam-flexure&proTab=rcSheets",
          "label": "La viga en Stabileo, en el armado por planillas del PRO. Cuatro botones y en este orden: \"Calcular\", \"Armado por planillas\" (en Salida), \"Dimensionar armaduras\" y \"Vigas\". El primero resuelve el modelo y muestra los resultados, el segundo vuelve a las planillas, el tercero dimensiona la armadura y el cuarto abre la planilla de vigas: la fila de V1 propone 2 Ø25 corridos abajo y 2 Ø16 arriba, cierra en una relación de 0,80 y dice \"Verifica\". Abrila para ver la envolvente de momentos contra la capacidad y cada verificación; la que da esa relación es \"Envolvente cubierta en toda la viga, con las barras ancladas\". Cambiá la carga y volvé a calcular. El armado por planillas sigue en desarrollo: revisá los resultados."
        },
        {
          "k": "h",
          "t": "En resumen"
        },
        {
          "k": "ol",
          "items": [
            "Antes de dimensionar, mirá si el momento está por encima o por debajo del cruce con el mínimo. Debajo, la armadura ya está decidida.",
            "Para H-20 a H-30, el mínimo no depende del hormigón. Sale de 1,4/fy.",
            "φ depende de εt: miralos siempre juntos.",
            "Si aparece armadura de compresión, es porque la sección perdió ductilidad, no porque falte capacidad."
          ]
        },
        {
          "k": "note",
          "t": "Todas las cifras salen del módulo CIRSOC 201 de Stabileo, corrido sobre las secciones que se indican, y no de una tabla. Una advertencia que vale la pena, porque la primera versión de esta nota se equivocó ahí: el cálculo a mano daba D/C = 0,74 porque olvidaba el peso propio, 2 kN/m que la aplicación suma a la carga permanente. Con él, la viga simplemente apoyada carga 1,2·14 + 1,6·8 = 29,6 kN/m, Mu = 29,6·5²/8 = 92,5 kN·m y, con 2 Ø25 (φMn = 113,55 kN·m), D/C = 0,81. La planilla de arriba propone justamente 2 Ø25 abajo y cierra en 0,80. Da 0,80 y no 0,81 porque toma el recubrimiento de la Tabla 20.5.1.3.1 (30 mm hasta el estribo, d = 34,95 cm) y cuenta en compresión los 2 Ø16 de arriba: φMn = 115,31 kN·m, y 92,5/115,31 = 0,80. Si alguna vez un número de acá no coincide con lo que muestra el editor, creele al editor."
        },
        {
          "k": "note",
          "t": "Recalcule la altura útil para cada diámetro seleccionado. La tabla de capacidades se contrasta con el motor actual; la capacidad por sí sola no constituye una verificación completa."
        }
      ]
    },
    "en": {
      "title": "Flexural verification to CIRSOC 201, step by step",
      "excerpt": "Almost everyone remembers φMn ≥ Mu. That is the last line of the check, not the check. The outcome is decided earlier, and one of those steps can pull φ below 0.9.",
      "blocks": [
        {
          "k": "p",
          "t": "Most people remember a flexural check as one inequality: φMn ≥ Mu. That is true, and it is the last line. What decides the outcome happens earlier, in steps that rarely get a close look because they seem like paperwork."
        },
        {
          "k": "p",
          "t": "This is what Stabileo's CIRSOC 201 module returns for a 20×40 cm beam of H-25 concrete, fy 420 steel, 25 mm cover and 8 mm stirrups, under a moment of 60 kN·m:"
        },
        {
          "k": "ol",
          "items": flexureExampleSteps("Tension reinforcement: 2 Ø20 (6.28 cm²)", ".")
        },
        {
          "k": "p",
          "t": "Ten steps. The tenth is the one everyone remembers. The ones that decide the result are the third and the ninth."
        },
        {
          "k": "h",
          "t": "Step 3: the minimum governs more often than it seems"
        },
        {
          "k": "p",
          "t": "Article 9.6.1.2 asks for a minimum flexural reinforcement equal to the greater of 0.25·√f'c/fy·bw·d and 1.4/fy·bw·d. It is usually treated as a floor that is almost never reached. In residential beams it is reached all the time."
        },
        {
          "k": "table",
          "caption": "The same 20×40 H-25 beam under increasing moments: what decides the reinforcement.",
          "head": [
            "Mu [kN·m]",
            "As by strength [cm²]",
            "As,min [cm²]",
            "Governs"
          ],
          "rows": [
            [
              "15",
              "1.12",
              "2.39",
              "the minimum"
            ],
            [
              "30",
              "2.28",
              "2.39",
              "the minimum"
            ],
            [
              "60",
              "4.73",
              "2.39",
              "strength"
            ],
            [
              "90",
              "7.38",
              "2.39",
              "strength"
            ]
          ]
        },
        {
          "k": "p",
          "t": "The crossover is at Mu = 31.5 kN·m. Below that moment, sizing for strength achieves nothing: the section carries 2.39 cm² either way. It is worth knowing which side of the crossover a beam is on before discussing its reinforcement."
        },
        {
          "k": "h",
          "t": "And the minimum rarely depends on the concrete"
        },
        {
          "k": "p",
          "t": "Of the article's two expressions, the √f'c one only exceeds the other for fairly strong concrete."
        },
        {
          "k": "table",
          "caption": "The two expressions for the minimum, for fy 420, per mille.",
          "head": [
            "Concrete",
            "0.25·√f'c/fy",
            "1.4/fy",
            "Governs"
          ],
          "rows": [
            [
              "H-20",
              "2.6620",
              "3.3333",
              "1.4/fy"
            ],
            [
              "H-25",
              "2.9762",
              "3.3333",
              "1.4/fy"
            ],
            [
              "H-30",
              "3.2603",
              "3.3333",
              "1.4/fy"
            ],
            [
              "H-35",
              "3.5215",
              "3.3333",
              "√f'c"
            ]
          ]
        },
        {
          "k": "p",
          "t": "The crossover is at f'c = 31.36 MPa. Across the whole range used in residential work (H-20, H-25, H-30), the minimum reinforcement does not depend on the concrete: it comes from 1.4/fy and nothing else. Going from H-20 to H-30 does not lower the minimum by a single square centimetre."
        },
        {
          "k": "h",
          "t": "Step 9: φ is not automatically 0.9"
        },
        {
          "k": "p",
          "t": "The strength reduction factor is taught as 0.90 for bending and then treated as a constant. It is not. It comes from the strain in the tension steel at the ultimate state, and the module says so in step 9: εt ≥ 5‰ → tension-controlled → φ = 0.90. Put more steel in the section and εt falls, taking φ with it."
        },
        {
          "k": "table",
          "caption": "The same beam, loaded further each time. εt and φ come from steps 8 and 9.",
          "head": [
            "Mu [kN·m]",
            "Reinforcement",
            "εt [‰]",
            "φ",
            "φMn [kN·m]",
            "Ductility"
          ],
          "rows": flexureExampleRows("Passes", "Does not pass", ".")
        },
        {
          "k": "p",
          "t": "The 2 Ø32 section does not pass: its tensile strain is below the required minimum. A reduced φ does not satisfy the ductility check. Redesign the section or its reinforcement."
        },
        {
          "k": "quote",
          "t": "The 2 Ø32 section does not pass: its tensile strain is below the required minimum. A reduced φ does not satisfy the ductility check. Redesign the section or its reinforcement."
        },
        {
          "k": "h",
          "t": "Why compression steel goes in"
        },
        {
          "k": "p",
          "t": "Compression reinforcement may be needed at the ductility limit. Do not wait until the tensile steel falls below its yield strain; verify the redesigned section at the actual bar depths."
        },
        {
          "k": "p",
          "t": "So compression steel is there to give the section its ductility back and recover the factor. The capacity follows, as a result."
        },
        {
          "k": "note",
          "t": "Compression reinforcement may be needed at the ductility limit. Do not wait until the tensile steel falls below its yield strain; verify the redesigned section at the actual bar depths."
        },
        {
          "k": "h",
          "t": "Try it on a real beam"
        },
        {
          "k": "p",
          "t": "Below is the model: a simply supported 5 m beam, 20×40, H-25, with 12 kN/m of dead load and 8 kN/m of live load, plus its own weight. It opens in PRO's reinforcement sheets, with CIRSOC 201-2025 as the code."
        },
        {
          "k": "img",
          "base": "blog/cirsoc-201-sheets",
          "w": 1600,
          "h": 1000,
          "alt": "Stabileo PRO, reinforcement sheets under CIRSOC 201-2025, the beam sheet open on V1 after solving and designing. The row proposes 2 Ø25 running along the bottom, 2 Ø16 running along the top and Ø8 stirrups at 18 cm, with a ratio of 0.80 and status OK. Below, the elevation with the bar marks and the moment and shear envelopes against the capacity.",
          "caption": "The beam below in the beam sheet, after “Design reinforcement”: the 2 Ø25 Stabileo proposes close at 0.80."
        },
        {
          "k": "embed",
          "mode": "pro",
          "query": "example=rc-beam-flexure&proTab=rcSheets",
          "label": "The beam in Stabileo, in PRO's reinforcement sheets. Four buttons, in this order: \"Solve\", \"Reinforcement sheets\" (under Output), \"Design reinforcement\" and \"Beams\". The first solves the model and shows the results, the second goes back to the sheets, the third designs the reinforcement and the fourth opens the beam sheet: the row for V1 proposes 2 Ø25 running along the bottom and 2 Ø16 on top, closes at a ratio of 0.80 and reads \"OK\". Open it to see the moment envelope against the capacity and each check; the one that gives that ratio is \"Envelope covered along the whole beam, bars developed\". Change the load and solve again. The reinforcement sheets are still in development: review the results."
        },
        {
          "k": "h",
          "t": "In short"
        },
        {
          "k": "ol",
          "items": [
            "Before sizing, check whether the moment is above or below the crossover with the minimum. Below it, the reinforcement is already decided.",
            "From H-20 to H-30, the minimum does not depend on the concrete. It comes from 1.4/fy.",
            "φ depends on εt: always read the two together.",
            "If compression steel appears, it is because the section lost ductility, not because it lacks capacity."
          ]
        },
        {
          "k": "note",
          "t": "Every figure here comes from Stabileo's CIRSOC 201 module, run on the sections named, and not from a table. One warning worth passing on, because the first draft of this post got it wrong: the hand calculation gave D/C = 0.74 because it left out the self-weight, 2 kN/m that the application adds to the dead case. With it, the simply supported beam carries 1.2·14 + 1.6·8 = 29.6 kN/m, Mu = 29.6·5²/8 = 92.5 kN·m and, with 2 Ø25 (φMn = 113.55 kN·m), D/C = 0.81. The sheet above proposes exactly 2 Ø25 along the bottom and closes at 0.80. It reads 0.80 rather than 0.81 because it takes the cover of Table 20.5.1.3.1 (30 mm to the stirrup, d = 34.95 cm) and counts the 2 Ø16 on top in compression: φMn = 115.31 kN·m, and 92.5/115.31 = 0.80. If a number here ever stops matching the editor, believe the editor."
        },
        {
          "k": "note",
          "t": "Recompute effective depth for each selected bar diameter. The capacity table is checked against the current engine; capacity alone is not a complete verification."
        }
      ]
    },
    "pt": {
      "title": "Verificação à flexão segundo a CIRSOC 201, passo a passo",
      "excerpt": "Quase todo mundo lembra de φMn ≥ Mu. Essa é a última linha da verificação, não a verificação. O resultado se decide antes, e um desses passos pode derrubar φ para menos de 0,9.",
      "blocks": [
        {
          "k": "p",
          "t": "Na memória de quase todo mundo, verificar uma viga à flexão se resume a uma desigualdade: φMn ≥ Mu. É verdade, e é a última linha. O que decide o resultado acontece antes, em passos que raramente recebem atenção porque parecem burocracia."
        },
        {
          "k": "p",
          "t": "Isto é o que o módulo CIRSOC 201 do Stabileo devolve para uma viga de 20×40 cm, concreto H-25, aço fy 420, 25 mm de cobrimento e estribos de 8, sob um momento de 60 kN·m:"
        },
        {
          "k": "ol",
          "items": flexureExampleSteps("Armadura de tração: 2 Ø20 (6,28 cm²)")
        },
        {
          "k": "p",
          "t": "Dez passos. O décimo é o que todos lembram. Os que decidem são o terceiro e o nono."
        },
        {
          "k": "h",
          "t": "Passo 3: o mínimo governa mais vezes do que parece"
        },
        {
          "k": "p",
          "t": "O artigo 9.6.1.2 exige uma armadura mínima de flexão igual ao maior entre 0,25·√f'c/fy·bw·d e 1,4/fy·bw·d. Costuma ser visto como um piso que quase nunca é atingido. Em vigas de edifícios residenciais, ele é atingido o tempo todo."
        },
        {
          "k": "table",
          "caption": "A mesma viga 20×40 de H-25, com momentos crescentes: quem decide a armadura.",
          "head": [
            "Mu [kN·m]",
            "As por resistência [cm²]",
            "As,mín [cm²]",
            "Governa"
          ],
          "rows": [
            [
              "15",
              "1.12",
              "2.39",
              "o mínimo"
            ],
            [
              "30",
              "2.28",
              "2.39",
              "o mínimo"
            ],
            [
              "60",
              "4.73",
              "2.39",
              "a resistência"
            ],
            [
              "90",
              "7.38",
              "2.39",
              "a resistência"
            ]
          ]
        },
        {
          "k": "p",
          "t": "O ponto de cruzamento fica em Mu = 31,5 kN·m. Abaixo desse momento, dimensionar pela resistência não adianta: a seção vai ter 2,39 cm² de qualquer jeito. Vale saber de que lado do cruzamento uma viga está antes de discutir a sua armadura."
        },
        {
          "k": "h",
          "t": "E o mínimo quase nunca depende do concreto"
        },
        {
          "k": "p",
          "t": "Das duas expressões do artigo, a de √f'c só supera a outra quando o concreto é de resistência bem alta."
        },
        {
          "k": "table",
          "caption": "As duas expressões do mínimo, para fy 420, em por mil.",
          "head": [
            "Concreto",
            "0,25·√f'c/fy",
            "1,4/fy",
            "Governa"
          ],
          "rows": [
            [
              "H-20",
              "2.6620",
              "3.3333",
              "1,4/fy"
            ],
            [
              "H-25",
              "2.9762",
              "3.3333",
              "1,4/fy"
            ],
            [
              "H-30",
              "3.2603",
              "3.3333",
              "1,4/fy"
            ],
            [
              "H-35",
              "3.5215",
              "3.3333",
              "√f'c"
            ]
          ]
        },
        {
          "k": "p",
          "t": "O ponto de cruzamento fica em f'c = 31,36 MPa. Em toda a faixa usada em edificações residenciais (H-20, H-25, H-30), a armadura mínima não depende do concreto: sai de 1,4/fy e nada mais. Passar de H-20 para H-30 não reduz o mínimo em um único centímetro quadrado."
        },
        {
          "k": "h",
          "t": "Passo 9: φ não vale 0,9 por decreto"
        },
        {
          "k": "p",
          "t": "O coeficiente de redução é ensinado como 0,90 para flexão e usado como constante. Não é. Ele vem da deformação da armadura tracionada no estado último, e o módulo diz isso no passo 9: εt ≥ 5‰ → seção controlada por tração → φ = 0,90. Coloque mais aço na seção e εt cai, levando φ junto."
        },
        {
          "k": "table",
          "caption": "A mesma viga, carregada cada vez mais. εt e φ vêm dos passos 8 e 9.",
          "head": [
            "Mu [kN·m]",
            "Armadura",
            "εt [‰]",
            "φ",
            "φMn [kN·m]",
            "Ductilidade"
          ],
          "rows": flexureExampleRows("Atende", "Não atende")
        },
        {
          "k": "p",
          "t": "A seção com 2 Ø32 não atende: sua deformação de tração está abaixo do mínimo exigido. Reduzir φ não satisfaz a verificação de ductilidade. Redimensione a seção ou sua armadura."
        },
        {
          "k": "quote",
          "t": "A seção com 2 Ø32 não atende: sua deformação de tração está abaixo do mínimo exigido. Reduzir φ não satisfaz a verificação de ductilidade. Redimensione a seção ou sua armadura."
        },
        {
          "k": "h",
          "t": "Por que entra armadura de compressão"
        },
        {
          "k": "p",
          "t": "A armadura de compressão pode ser necessária no limite de ductilidade. Não espere até que o aço tracionado deixe de escoar; verifique a seção redimensionada com as profundidades reais das barras."
        },
        {
          "k": "p",
          "t": "Ou seja, a armadura de compressão está ali para devolver ductilidade à seção e recuperar o coeficiente. A capacidade vem depois, como resultado."
        },
        {
          "k": "note",
          "t": "A armadura de compressão pode ser necessária no limite de ductilidade. Não espere até que o aço tracionado deixe de escoar; verifique a seção redimensionada com as profundidades reais das barras."
        },
        {
          "k": "h",
          "t": "Experimente numa viga de verdade"
        },
        {
          "k": "p",
          "t": "Abaixo está o modelo: uma viga simplesmente apoiada de 5 m, 20×40, H-25, com 12 kN/m de carga permanente e 8 kN/m de sobrecarga, mais o peso próprio. Abre na armação por planilhas do PRO, com a CIRSOC 201-2025 como norma."
        },
        {
          "k": "img",
          "base": "blog/cirsoc-201-sheets",
          "w": 1600,
          "h": 1000,
          "alt": "Stabileo PRO, armação por planilhas com a CIRSOC 201-2025, a planilha de vigas aberta em V1 depois de calcular e dimensionar. A linha propõe 2 Ø25 corridos embaixo, 2 Ø16 corridos em cima e estribos Ø8 c/18, com relação de 0,80 e estado Verifica. Abaixo, a elevação com as marcas das barras e as envoltórias de momento e cortante contra a capacidade.",
          "caption": "A viga abaixo na planilha de vigas, depois de «Dimensionar armaduras»: os 2 Ø25 que o Stabileo propõe fecham em 0,80."
        },
        {
          "k": "embed",
          "mode": "pro",
          "query": "example=rc-beam-flexure&proTab=rcSheets",
          "label": "A viga no Stabileo, na armação por planilhas do PRO. Quatro botões, nesta ordem: \"Calcular\", \"Armação por planilhas\" (em Saída), \"Dimensionar armaduras\" e \"Vigas\". O primeiro resolve o modelo e mostra os resultados, o segundo volta às planilhas, o terceiro dimensiona a armadura e o quarto abre a planilha de vigas: a linha de V1 propõe 2 Ø25 corridos embaixo e 2 Ø16 em cima, fecha com relação de 0,80 e diz \"Verifica\". Abra-a para ver a envoltória de momentos contra a capacidade e cada verificação; a que dá essa relação é \"Envoltória coberta em toda a viga, com barras ancoradas\". Mude a carga e calcule de novo. A armação por planilhas segue em desenvolvimento: revise os resultados."
        },
        {
          "k": "h",
          "t": "Em resumo"
        },
        {
          "k": "ol",
          "items": [
            "Antes de dimensionar, veja se o momento está acima ou abaixo do cruzamento com o mínimo. Abaixo dele, a armadura já está decidida.",
            "De H-20 a H-30, o mínimo não depende do concreto. Sai de 1,4/fy.",
            "φ depende de εt: olhe sempre os dois juntos.",
            "Se aparece armadura de compressão, é porque a seção perdeu ductilidade, não porque falta capacidade."
          ]
        },
        {
          "k": "note",
          "t": "Todos os valores vêm do módulo CIRSOC 201 do Stabileo, rodado nas seções indicadas, e não de uma tabela. Um aviso que vale a pena, porque a primeira versão desta nota errou nisso: o cálculo à mão dava D/C = 0,74 porque esquecia o peso próprio, 2 kN/m que a aplicação soma à carga permanente. Com ele, a viga simplesmente apoiada carrega 1,2·14 + 1,6·8 = 29,6 kN/m, Mu = 29,6·5²/8 = 92,5 kN·m e, com 2 Ø25 (φMn = 113,55 kN·m), D/C = 0,81. A planilha acima propõe justamente 2 Ø25 embaixo e fecha em 0,80. Dá 0,80 e não 0,81 porque usa o cobrimento da Tabela 20.5.1.3.1 (30 mm até o estribo, d = 34,95 cm) e conta em compressão os 2 Ø16 de cima: φMn = 115,31 kN·m, e 92,5/115,31 = 0,80. Se algum número daqui deixar de coincidir com o editor, acredite no editor."
        },
        {
          "k": "note",
          "t": "Recalcule a altura útil para cada diâmetro selecionado. A tabela de capacidades é conferida com o motor atual; a capacidade isolada não constitui uma verificação completa."
        }
      ]
    }
  }
};
