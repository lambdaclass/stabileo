# INPRES-CIRSOC 103 Parte II (2005) — CAPÍTULO 4. SISTEMAS PÓRTICO-TABIQUE SISMORRE

> Source: `INPRES-CIRSOC-103_Parte_II-Reglamento.pdf` · PDF pages 81–86
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

SISTENTES DE HORMIGÓN ARMADO


<a id="c4.0"></a>
### 4.0 SIMBOLOGÍA  <sub>p.81</sub>


                                                             2
Ag                área bruta de la sección transversal, en mm .

H                 altura total de la estructura, en mm.

Ln                altura libre entre pisos u otros apoyos laterales efectivos, o luz libre de un
                  elemento, en mm.
        capitel
ME                momento en columna, derivado de las fuerzas sísmicas horizontales, tomado en
                  el eje de la viga superior, en N mm.

                  capacidad resistente flexional de la columna ( M c = λo M n ) , en N mm.
    o                                                               o      c
M col

Pu                esfuerzo axial requerido, puede provenir de las combinaciones de carga o
                  criterios de diseño por capacidad, en N.

Rm                factor de reducción de momento en columnas.

Rv                factor de reducción de carga axial en columnas.

Vcol              esfuerzo de corte de diseño en columnas, en N.
    c
V E               esfuerzo de corte en columnas derivado de las fuerzas sísmicas horizontales, en
                  N.

VE total          esfuerzo de corte total, en N.

Vu                esfuerzo de corte de diseño, en N.
    w
V base            esfuerzo de corte en la base de un tabique, en N.
    w
V E               esfuerzo de corte en tabiques derivado de las fuerzas sísmicas horizontales, en
                  N.
    w
V iE              esfuerzo de corte en el tabique i-ésimo derivado de las fuerzas sísmicas
                  horizontales, en N.

f’c               resistencia especificada a la compresión del hormigón, en MPa.

hb                altura total de la sección de una viga de acoplamiento, en mm.

hw                altura de un tabique, en mm.

n                 Número de pisos por sobre el nivel considerado.

Reglamento INPRES-CIRSOC 103, Parte II                                                   Cap. 4 - 63


<!-- page 81 -->

φ            factor de reducción de resistencia.

φ ob         factor de sobrerresistencia flexional en vigas.

φ ow         factor de sobrerresistencia flexional en tabiques.

ηv           relación de corte en tabiques para sistemas pórtico-tabique

µ            factor de ductilidad global.

ω            factor de amplificación dinámica.

ωc           factor de amplificación dinámica para columnas de sistemas pórtico-tabique.

ωp           factor de amplificación dinámica para columnas de sistemas pórtico-tabique
             cuando los tabiques no poseen la altura total de la estructura.

ω∗v          factor de amplificación dinámica para tabiques.


<a id="c4.1"></a>
### 4.1 REQUERIMIENTOS GENERALES DE DISEÑO  <sub>p.82</sub>


Los requerimientos de diseño establecidos en este Capítulo, deberán aplicarse a los
sistemas estructurales donde la resistencia a la acción sísmica horizontal se provea por la
contribución combinada de pórticos y tabiques sismorresistentes de hormigón armado. Los
requerimientos establecidos en el Capítulo 2, “Pórticos Sismorresistentes de Hormigón
Armado” y en el Capítulo 3, “Tabiques Sismorresistentes de Hormigón Armado” deberán
aplicarse en su totalidad en tanto no sean modificados por las prescripciones aquí
establecidas.


<a id="c4.1.1"></a>
### 4.1.1 Ductilidad global de la estructura  <sub>p.82</sub>


La ductilidad global de la estructura se determinará:

(a) Cuando el corte en la base resistido por los tabiques sea menor o igual a 1/3 del corte
    total en la base, deberá adoptarse el valor de la ductilidad global correspondiente a
    pórticos sismorresistentes de hormigón armado con ductilidad completa (µ = 6).

(b) Cuando el corte en la base resistido por los tabiques sea mayor o igual a 2/3 del corte
    total en la base, deberá adoptarse el valor de la ductilidad global establecido en la
    Tabla 3.1. correspondiente a tabiques sismorresistentes.

(c) Cuando el corte en la base resistido por los tabiques esté comprendido entre 1/3 y 2/3
    del corte total en la base, el valor de la ductilidad global deberá obtenerse interpolando
    linealmente entre los valores establecidos precedentemente en (a) y (b).


<a id="c4.2"></a>
### 4.2 DISEÑO DE PÓRTICOS  <sub>p.82</sub>



<a id="c4.2.1"></a>
### 4.2.1 Diseño de vigas  <sub>p.82</sub>


Deberán cumplirse los requerimientos establecidos en el artículo 2.2.


<!-- page 82 -->


<a id="c4.2.2"></a>
### 4.2.2 Diseño de columnas  <sub>p.83</sub>


Deberán cumplirse los requerimientos establecidos en el artículo 2.3., salvo los
expresamente modificados en este apartado.


<a id="c4.2.2.1"></a>
### 4.2.2.1 Momentos de diseño  <sub>p.83</sub>


Los momentos de diseño en las secciones extremas de columnas donde no se espera el
desarrollo de rótulas plásticas, se determinarán con la expresión (2.3-11). En este caso
deberá tomarse el factor de reducción de resistencia φ = 1.

El factor de reducción de momento Rm , deberá determinarse de acuerdo con:

                                                 ⎛      P        ⎞
          0 ,75 ≤ Rm = 1,00 + 0 ,50 ( ω − 1,00 ) ⎜ 10 ' u − 1,00 ⎟ ≤ 1,00                 (4 - 1)
                                                 ⎜    fc Ag      ⎟
                                                 ⎝               ⎠

                            Pu
donde: − 0 ,15 ≤                ≤ 0 ,10 deberá tomarse con signo negativo cuando sea de tracción.
                      fc'    Ag

La expresión (4 - 1) modifica a la Tabla 2.3. para el caso de estructuras pórtico-tabique.

El factor de amplificación dinámica ω deberá tomarse de acuerdo con la Figura 4.1.(a),
cuando el tabique se extienda en toda la altura, y de acuerdo con la Figura 4.1.(b) cuando
el tabique no se extienda en toda la altura. En este último caso, deberá tomarse:

                                               ⎛ hw ⎞
                                    ωp = ω − ⎜      ⎟ ( ω − 1,20 )                        (4 - 2)
                                               ⎝ H ⎠

donde ω está dado por la expresión (2.3-8)

La Figura 4.1. modifica, para el caso de estructuras pórtico tabique, a la Figura 2.11.


<a id="c4.2.2.2"></a>
### 4.2.2.2 Esfuerzos axiales de diseño  <sub>p.83</sub>


Los esfuerzos axiales inducidos en cualquier nivel, sólo por las acciones sísmicas
horizontales, que deberán utilizarse en conjunto con los derivados de las cargas
gravitatorias mayoradas y con los momentos de diseño para determinar la resistencia de la
sección de la columna, deberán determinarse con la expresión (2.3-12) con Rv igual a:

                                         ⎛         n ⎞
                                    Rv = ⎜ 1,00 −    ⎟ ≥ 0 ,70                            (4 - 3)
                                         ⎝        67 ⎠

La expresión (4-3) modifica a la Tabla 2.4. para el caso de estructuras pórtico-tabique.

Reglamento INPRES-CIRSOC 103, Parte II                                                   Cap. 4 - 65


<!-- page 83 -->


<a id="c4.2.2.3"></a>
### 4.2.2.3 Esfuerzo de corte de diseño  <sub>p.84</sub>


El esfuerzo de corte de diseño, deberá evaluarse de acuerdo con:

                              Vu = Vcol = ωc φbo VEc                                            (4 – 4.a)

donde ω c, el factor de amplificación dinámica, deberá tomarse igual a:

   ω c = 2,50 para el piso inferior
   ω c = 2,00 para el piso superior
   ω c = 1,30 para los pisos intermedios

Para las columnas del piso inferior deberá además cumplirse:

                                              o
                                             Mcol  + 1,30 φbo M Ecapitel
                                      Vu ≥                                                      (4 – 4.b)
                                                  Ln + 0 ,50 hb

Cuando se utilice el factor de reducción de momento Rm de acuerdo con la expresión
(4-1), el esfuerzo de corte Vu, podrá reducirse proporcionalmente.

La expresión (4-4) reemplaza a las expresiones (2.3-19), (2.3-20) y (2.3-21), para el caso
de estructuras pórtico-tabique.

                    1,00                                                                1,00

                                                                                           ωp
    0,70 H
                       ω
                                        H
                      1,20                                                               1,20
                                                                                hw

    0,30 H                                                                                              0,30 H

                     1,00                                                               1,00

       (a) Tabique sismorresistente                                 (b) Tabique sismorresistente
           con altura hw total                                          con altura hw parcial

       Figura 4.1. Factor de amplificación dinámica para momentos de columnas en
                   sistemas pórtico-tabique.


<!-- page 84 -->


<a id="c4.3"></a>
### 4.3 DISEÑO DE TABIQUES  <sub>p.85</sub>


Deberá cumplirse con lo especificado en el Capítulo 3 “Tabiques Sismorresistentes de
Hormigón Armado”, con las modificaciones que se introducen en este artículo.


<a id="c4.3.1"></a>
### 4.3.1 Interrupción en altura de la armadura longitudinal  <sub>p.85</sub>


La armadura longitudinal podrá interrumpirse en altura de manera de proveer una
resistencia flexional al menos igual a la que se obtiene del diagrama envolvente de
momentos dado en la Figura 4.2.

Las barras longitudinales, deberán prolongarse desde la sección donde se requieren que
desarrollen su resistencia una longitud al menos igual a ld .

                                           resistencia nominal
                                           mínima a flexión

                                         diagrama de
                                         momento

                                           Lw

                                                          Mw
                                                           n
                                                             base

      Figura 4.2. Diagrama envolvente de los momentos de diseño para sistemas
                  pórtico-tabique.


<a id="c4.3.2"></a>
### 4.3.2 Esfuerzo de corte de diseño  <sub>p.85</sub>



<a id="c4.3.2.1"></a>
### 4.3.2.1 El esfuerzo de corte de diseño en la sección correspondiente a la base del  <sub>p.85</sub>

tabique, deberá evaluarse:

                                         w
                                   Vu = Vbase    * φo V w
                                              = ωv                                 (4 - 5)
                                                    w  E

                                   ω v* = 1,00 + ( ωv − 1,00 ) ηv                  (4 - 6)

siendo:
          ωv   el factor de amplificación dinámica dado por las expresiones (3-16), (3-17)
               y (3-18).

Reglamento INPRES-CIRSOC 103, Parte II                                            Cap. 4 - 67


<!-- page 85 -->

                                                             ⎛ n Vw         ⎞
                                                             ⎜        iE    ⎟
         ηv     determinado con la siguiente expresión: ηv = ⎜ ∑            ⎟             (4 - 7)
                                                             ⎜ i =1 VEtotal ⎟
                                                             ⎝              ⎠ base

Este artículo modifica al artículo 3.6.1. para el caso de estructuras pórtico-tabique.


<a id="c4.3.2.2"></a>
### 4.3.2.2 El esfuerzo de corte de diseño en las secciones ubicadas por encima de la  <sub>p.86</sub>

sección correspondiente a la base del tabique, no deberá ser menor que el que resulta del
diagrama envolvente de la Figura 4.3. Este diagrama modifica las expresiones (3-15) y
(3-33) para el caso de estructuras pórtico-tabique.

                                                                   w
                                                             0,50 V base

                                                                           2 hw
                                                                           3

                                                                           1 hw
                                                                           3
                                        Lw

                                                             w
                                                        V base

                          Figura 4.3. Envolvente para el corte de diseño.


<!-- page 86 -->
