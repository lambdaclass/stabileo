# INPRES-CIRSOC 103 Parte II (2005) — CAPÍTULO 7. ESTRUCTURAS CON DUCTILIDAD LIMITA

> Source: `INPRES-CIRSOC-103_Parte_II-Reglamento.pdf` · PDF pages 95–110
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

DA


<a id="c7.0"></a>
### 7.0 SIMBOLOGÍA  <sub>p.95</sub>


                                                                                                2
A’s      área de la sección transversal de la armadura longitudinal superior en vigas, en mm .
                                                                         2
Ab       área de la sección transversal de una barra individual, en mm .

Ac       área del núcleo confinado de hormigón medida desde el perímetro externo de los
                        2
         estribos, en mm .

Ash      área total efectiva de estribos y estribos suplementarios de una rama en cada una
                                                                        2
         de las direcciones principales de la sección transversal, en mm .
                                                           2
Ast      armadura longitudinal total en columnas, en mm .
Asw      área total de la armadura vertical en el alma de un tabique, en mm2 (se utiliza
         indistintamente: armadura vertical, armadura longitudinal, barras verticales o barras
         longitudinales).
                                                               2
Ate      área de la sección de una rama de estribo, en mm .

H        altura total de la estructura, en mm.

Ln       altura libre entre pisos u otros apoyos laterales efectivos, o luz libre de un elemento,
         en mm.

ME       momento producido por las fuerzas horizontales solamente, en N mm.

ME1      momento producido por las fuerzas horizontales solamente en las columnas del
         primer piso, en N mm.

Mu       momento requerido, en N mm.

Pu       esfuerzo axial de diseño, en N.

Rm       factor de reducción de momento en columnas.

Rv       factor de reducción de carga axial en columnas.

V cE     esfuerzo de corte en columnas derivado las fuerzas sísmicas horizontales, en N.

Vu       esfuerzo de corte de diseño, en N.

d        altura útil de la sección, en mm.

Reglamento INPRES-CIRSOC 103, Parte II                                                Cap. 7 - 77


<!-- page 95 -->

db        diámetro de las barras longitudinales, en mm.

f’c       resistencia especificada a la compresión del hormigón, en MPa.

fy        tensión de fluencia especificada de la armadura longitudinal (es el límite de fluencia
          nominal de la norma IRAM-IAS), en MPa.

fyt       tensión de fluencia especificada de la armadura transversal (es el límite de fluencia
          nominal de la norma IRAM-IAS), en MPa.

H         altura del elemento, en mm.

h’’       altura del núcleo confinado de una sección rectangular, en mm.

hb        altura de la viga, en mm.

hi        menor altura de piso, en mm.

m         relación definida como m = fy / (0,85 f’c) .

s         separación de la armadura transversal tomada en dirección paralela al eje
          longitudinal del elemento, en mm.

vb        tensión de corte básica, en MPa.

vc        tensión nominal de corte provista por el hormigón, en MPa.

vn        tensión nominal total de corte (vn = vc + vs ), en MPa.

φ         factor de reducción de resistencia.

φ ob      factor de sobrerresistencia flexional de vigas.

µ         ductilidad global.

ρ         cuantía de armadura inferior en vigas.

ρ’        cuantía de armadura superior en vigas.

ρl        cuantía de la armadura vertical en tabiques (ρl = Asw /(bi sv)).

ρs        cuantía volumétrica de estribos circulares o en espiral.

ρt        cuantía de la armadura longitudinal total de columna (ρt = Ast /Ag ).


<a id="c7.1"></a>
### 7.1 CAMPO DE VALIDEZ  <sub>p.96</sub>


Las prescripciones contenidas en este Capítulo deberán aplicarse al diseño de
estructuras o elementos estructurales que puedan estar sujetos a demandas de
ductilidad reducidas (µ ≤ 3), en comparación a las estructuras con ductilidad completa,
debido a poseer una resistencia mayor a la mínima estipulada; sea por su posición en la


<!-- page 96 -->

estructura, sea por poseer insuficiente capacidad de ductilidad de desplazamiento, sea
por que son inapropiadas como para poder considerarlas con ductilidad completa.


<a id="c7.2"></a>
### 7.2 REQUISITOS GENERALES  <sub>p.97</sub>



<a id="c7.2.1"></a>
### 7.2.1 El diseño de estructuras o elementos estructurales con ductilidad limitada, deberá  <sub>p.97</sub>

satisfacer los requerimientos especificados en los Capítulos 1 al 6 de esta Parte II, a
menos que sean expresamente modificados en este Capítulo.


<a id="c7.2.2"></a>
### 7.2.2 Los sistemas estructurales siguientes, podrán diseñarse de acuerdo con las  <sub>p.97</sub>

condiciones establecidas en este Capítulo:

a) Sistemas de tabiques sismorresistentes (individuales o acoplados).

b) Pórticos sismorresistentes con mecanismo de colapso global (rotulación plástica sólo
   en vigas con excepción de las columnas del último piso y de la sección inferior de las
   columnas del primer piso).

c) Pórticos sismorresistentes con rotulación plástica en capitel y base de algunas
   columnas.

d) Pórticos sismorresistentes con piso débil.


<a id="c7.3"></a>
### 7.3 PÓRTICOS SISMORRESISTENTES  <sub>p.97</sub>



<a id="c7.3.1"></a>
### 7.3.1 Mecanismo de colapso  <sub>p.97</sub>



<a id="c7.3.1.1"></a>
### 7.3.1.1 En el caso de pórticos donde el mecanismo de colapso elegido se base en el  <sub>p.97</sub>

desarrollo de rótulas plásticas en vigas solamente, con la excepción de las columnas del
último piso y de la sección inferior de las columnas del primer piso, las solicitaciones de
diseño en las columnas deberán tener en cuenta los efectos siguientes:

   a)   Sobrerresistencia posible de las vigas.

   b)   Simultaneidad de las acciones sísmicas en dos direcciones ortogonales.

   c)   Amplificación de los momentos en las columnas debidos a los efectos dinámicos.

Las prescripciones contenidas en este Capítulo podrán aplicarse cuando la ductilidad
global no sea mayor que 3. Cuando las rótulas plásticas en las vigas no se desarrollen en
la cara de la columna, deberá tenerse en cuenta el aumento en la demanda de ductilidad
local. En este caso, cuando las demandas de ductilidad locales en las zonas críticas de las
vigas sean mayores que 3 (µm > 3), éstas deberán detallarse para ductilidad completa.


<a id="c7.3.1.2"></a>
### 7.3.1.2 En estructuras aporticadas donde se prevea la formación de un mecanismo de  <sub>p.97</sub>

colapso del tipo piso blando, el número de pisos no podrá ser mayor que 3 y la altura
máxima no podrá superar 12 m. Se permitirá un piso adicional de material liviano siempre
que el peso de la construcción sea menor que 1,50 kPa veces el área del piso.

Reglamento INPRES-CIRSOC 103, Parte II                                           Cap. 7 - 79


<!-- page 97 -->


<a id="c7.3.1.3"></a>
### 7.3.1.3 Para mecanismos de colapso tipo piso blando, la ductilidad global de la estructura  <sub>p.98</sub>

a adoptar, deberá ser:

                                                    hi
                                     µ ≤ 1 + 2                                       (7 - 1)
                                                    H

a menos que se detalle la estructura de acuerdo con lo especificado en el Capítulo 2 de
esta Parte II, en cuyo caso la ductilidad global a adoptar deberá ser:

                                                    hi
                                     µ ≤ 1 + 5                                       (7 - 2)
                                                    H

siendo:

          hi      la menor altura de piso.

          H       la altura total medida desde la base hasta el máximo nivel que posea un
                  diafragma de hormigón.


<a id="c7.3.1.4"></a>
### 7.3.1.4 Los mecanismos de colapso de traslación lateral de viga parciales son los que  <sub>p.98</sub>

incorporan algunas columnas que desarrollan en cualquier piso, simultáneamente, rótulas
plásticas en capitel y base, mientras que un número suficiente de columnas del mismo
piso permanecen elásticas. Podrá utilizarse lo estipulado en este Capítulo, sólo cuando la
ductilidad global no sea mayor que 3. La capacidad al corte de las columnas inelásticas se
determinará considerando la sobrerresistencia flexional desarrollada en las rótulas
plásticas en los extremos de las columnas. Las columnas elásticas deberán tener una
resistencia flexional adecuada para absorber, sin fluencia, los momentos desarrollados en
las rótulas plásticas de las vigas adyacentes considerando su sobrerresistencia a flexión y
teniendo en cuenta la amplificación dinámica de los momentos en los extremos de las
columnas.

Para evaluar las solicitaciones de las columnas, deberán aplicarse los procedimientos
especificados en el artículo 7.3.3.1. La ductilidad global adoptada, no deberá ser mayor
que 12 veces la relación entre la capacidad al corte de las columnas elásticas y el corte
total de piso a desarrollar.


<a id="c7.3.1.5"></a>
### 7.3.1.5 Cuando se espera que las columnas desarrollen rótulas plásticas, se pueden  <sub>p.98</sub>

presentar 2 casos:

 (a) Vigas adyacentes con rótulas plásticas.

 (b) Vigas que tienen una resistencia nominal mayor que el momento impartido por las
     rótulas plásticas, en los extremos de las columnas en el desarrollo de su
     sobrerresistencia flexional. En este caso las vigas podrán diseñarse de acuerdo con
     lo especificado en el Reglamento CIRSOC 201-2005.


<!-- page 98 -->


<a id="c7.3.2"></a>
### 7.3.2 Diseño de vigas  <sub>p.99</sub>



<a id="c7.3.2.1"></a>
### 7.3.2.1 Resistencia flexional  <sub>p.99</sub>


La resistencia de las secciones transversales de vigas, deberá basarse en lo establecido
en el artículo 10.2. del Reglamento CIRSOC 201-2005.


<a id="c7.3.2.2"></a>
### 7.3.2.2 Limitaciones dimensionales  <sub>p.99</sub>


Las dimensiones de los elementos deberán limitarse de acuerdo con lo especificado en el
artículo 2.2.1.


<a id="c7.3.2.3"></a>
### 7.3.2.3 Zona de formación potencial de rótulas plásticas  <sub>p.99</sub>


Las zonas de formación potencial de rótulas plásticas en vigas, deberán ser las
especificadas en el artículo 2.2.5.


<a id="c7.3.2.4"></a>
### 7.3.2.4 Armadura longitudinal  <sub>p.99</sub>



<a id="c7.3.2.4.1"></a>
### 7.3.2.4.1 La armadura longitudinal en vigas deberá cumplir:  <sub>p.99</sub>


(a) En las secciones ubicadas dentro de la zona de formación potencial de rótulas
    plásticas, el área de la armadura longitudinal superior A’s deberá ser tal que:

                                          3
                                   ρ' ≥     ρ                                         (7 - 3)
                                          8

(b) Con lo especificado en los artículos 2.2.6. (a), (c), (d), y (e)


<a id="c7.3.2.4.2"></a>
### 7.3.2.4.2 Las vigas de sección T y L construidas monolíticamente con las losas deberán  <sub>p.99</sub>

diseñarse de acuerdo con el artículo 2.2.4.2. y 2.2.4.3.


<a id="c7.3.2.5"></a>
### 7.3.2.5 Armadura transversal  <sub>p.99</sub>


Deberá disponerse armadura transversal en las zonas de formación potencial de rótulas
plásticas en vigas de acuerdo con lo siguiente:

(a) En las zonas de formación potencial de rótulas plásticas definidas en los artículos
    2.2.5. (a) y (b), la separación entre centros de estribos a lo largo de cualquier barra
    longitudinal en compresión a ser restringida para evitar el pandeo, no deberá ser mayor
    que d/4 ó 10 veces el diámetro de la menor barra longitudinal.

(b) En las zonas de formación potencial de rótulas plásticas definidas en el artículo 2.2.5.
    (c), la separación entre centros de estribos, cerrados y de una rama, no deberá ser
    mayor que d/3 o 10 veces el diámetro de la menor barra longitudinal a ser restringida.

(c) En todos los otros aspectos, deberá cumplirse con lo especificado en el artículo 2.2.7.

Reglamento INPRES-CIRSOC 103, Parte II                                             Cap. 7 - 81


<!-- page 99 -->


<a id="c7.3.2.6"></a>
### 7.3.2.6 Corte  <sub>p.100</sub>



<a id="c7.3.2.6.1"></a>
### 7.3.2.6.1 Para la determinación de los esfuerzos de corte de diseño en vigas, se seguirán  <sub>p.100</sub>

los criterios del diseño por capacidad. Deberán considerarse las solicitaciones
correspondientes al desarrollo de la sobrerresistencia flexional, junto con las cargas
gravitatorias mayoradas.


<a id="c7.3.2.6.2"></a>
### 7.3.2.6.2 La máxima demanda de corte no necesita ser mayor que la correspondiente a la  <sub>p.100</sub>

respuesta elástica.

<a id="c7.3.2.6.3"></a>
### 7.3.2.6.3 En las zonas de formación potencial de rótulas plásticas definidas en el artículo  <sub>p.100</sub>

2.2.5., cuando la demanda de ductilidad µ no sea mayor que 3, la contribución del
hormigón a la resistencia al corte deberá ser tal que:

                                                vc = 0,50 vb ≥ 0                      (7 - 4)


<a id="c7.3.3"></a>
### 7.3.3 Diseño de columnas  <sub>p.100</sub>



<a id="c7.3.3.1"></a>
### 7.3.3.1 Solicitaciones de diseño  <sub>p.100</sub>



<a id="c7.3.3.1.1"></a>
### 7.3.3.1.1 El método para la determinación de las solicitaciones en columnas de pórticos  <sub>p.100</sub>

con ductilidad limitada, es una versión modificada de la presentada en el Capítulo 2 para
pórticos con ductilidad completa. Por ello, lo especificado en el Capítulo 2 deberá
cumplirse también en el caso de estructuras con ductilidad limitada, a excepción de lo que
específicamente se modifique en este Capítulo.


<a id="c7.3.3.1.2"></a>
### 7.3.3.1.2 Los momentos de diseño en las secciones extremas de columnas donde no se  <sub>p.100</sub>

espera el desarrollo de rótulas plásticas, se determinará:

(a) Para pórticos planos

                                     M u = 1,10 φ bo M E − 0 ,30 hb Vu                (7 - 5)

(b) Para pórticos espaciales

                                     M u = 1,30 φ bo M E − 0 ,30 hb Vu                (7 - 6)

   donde φ b ME no necesita ser mayor que ME correspondiente a la respuesta elástica
               o

   (µ ≤ 1,25).

(c) Para pórticos con ductilidad limitada, deberá tomarse Rm = 1,00.


<a id="c7.3.3.1.3"></a>
### 7.3.3.1.3 Los momentos de diseño en las columnas del primer piso se determinarán:  <sub>p.100</sub>


(a) Para pórticos planos:

                                        Mu = 1,20 ME1                                 (7 - 7)


<!-- page 100 -->

(b) Para pórticos espaciales:

                                         Mu = 1,35 ME1                              (7 - 8)


<a id="c7.3.3.1.4"></a>
### 7.3.3.1.4 Los esfuerzos axiales de diseño se determinarán con la expresión (2.3-12)  <sub>p.101</sub>

con Rv = 1,00.


<a id="c7.3.3.1.5"></a>
### 7.3.3.1.5 Los esfuerzos de corte de diseño se determinarán:  <sub>p.101</sub>


(a) Para pórticos planos:

                                         Vu = 1,10 φ b V E
                                                   o     c
                                                                                    (7 - 9)

(b) Para pórticos espaciales:

                                         Vu = 1,30 φ b V E
                                                    o    c
                                                                                  (7 - 10)

donde φ b V E no necesita ser mayor que V E correspondiente a la respuesta elásti-
          o     c                                        c

ca (µ ≤ 1,25).

Para las columnas del primer piso de pórticos planos o espaciales, Vu deberá determi-
narse con la expresión (2.3-21).


<a id="c7.3.3.2"></a>
### 7.3.3.2 Resistencia a flexión y esfuerzo axial  <sub>p.101</sub>


La resistencia de las secciones transversales de columnas, deberá basarse en lo
establecido en el artículo 10.2. del Reglamento CIRSOC 201-2005 cuando se considera
que toda la sección transversal contribuye a la resistencia del elemento o, en las
relaciones tensión-deformación para el acero y el hormigón confinado, cuando sólo se
considera que el núcleo de la sección transversal contribuye a la resistencia del elemento.


<a id="c7.3.3.3"></a>
### 7.3.3.3 Limitaciones dimensionales  <sub>p.101</sub>


Las dimensiones de los elementos deberán limitarse de acuerdo con lo especificado en el
artículo 2.3.1.


<a id="c7.3.3.4"></a>
### 7.3.3.4 Zona de formación potencial de rótulas plásticas  <sub>p.101</sub>


Las zonas de formación potencial de rótulas plásticas en columnas y pilotes deberán
cumplir con lo especificado en el artículo 2.3.7.


<a id="c7.3.3.5"></a>
### 7.3.3.5 Armadura longitudinal  <sub>p.101</sub>



<a id="c7.3.3.5.1"></a>
### 7.3.3.5.1 La armadura longitudinal en columnas y pilotes, deberá cumplir con lo  <sub>p.101</sub>

especificado en el artículo 2.3.8.

Reglamento INPRES-CIRSOC 103, Parte II                                           Cap. 7 - 83


<!-- page 101 -->


<a id="c7.3.3.6"></a>
### 7.3.3.6 Armadura transversal  <sub>p.102</sub>


La armadura transversal en columnas y pilotes deberá cumplir:

(a) En las zonas de formación potencial de rótulas plásticas definidas en el artículo 2.3.7.,
    cuando se utilicen estribos circulares o en espiral:

       (i)   La cuantía de la armadura transversal no deberá ser menor que la requerida por:

                                     ( 1,00 - ρt m ) Ag fc'          Pu
                              ρs =                                        − 0 ,0084         (7 - 11)
                                           2 ,40          Ac f yt φ f ' A
                                                                     c g

             ni menor que la requerida por la expresión (2.3-17).

       (ii) La separación entre centros de estribos circulares o en espiral no deberá ser
            mayor que la menor entre 1/4 del diámetro de la sección transversal y 10 veces
            el diámetro de la menor barra longitudinal a ser restringida.

(b) En las zonas de formación potencial de rótulas plásticas definidas en el artículo 2.3.7.
    cuando se utilicen estribos rectangulares con o sin estribos suplementarios de una
    rama:

       (i)   El área total efectiva de estribos cerrados y de estribos suplementarios de una
             rama en cada una de las direcciones principales de la sección transversal con
             separación sh no deberá ser menor que:

               Ash =
                        ( 1,00 - ρt m ) s h'' Ag       fc'  Pu
                                                                        − 0 ,0065 s h' '      (7 - 12)
                                 3 ,30             Ac fyt φ fc' Ag

             ni menor que la requerida por la expresión (2.2-10).

       (ii) La separación entre centros de capas de estribos no deberá ser mayor que la
            menor entre 1/4 de la menor dimensión lateral de la sección transversal y 10
            veces el diámetro de la menor barra longitudinal a ser restringida.

       (iii) Cada barra longitudinal o conjunto de barras deberán estar soportadas
             lateralmente, de acuerdo con lo especificado en el artículo 2.3.9.1.(b). (iii).

(c) En columnas donde no se prevea la formación de rótulas plásticas, la armadura
    transversal requerida en los extremos de la longitud correspondiente a la zona de
    formación potencial de rótulas plásticas, no deberá ser menor que la dada por la
    expresión (7-11), ni menor que:

                                                Ast          fy    1
                                     ρs =                                                     (7 - 13)
                                              155 d ' '      f yt d b


<!-- page 102 -->

     cuando se utilicen estribos circulares o en espiral.

     Cuando se utilicen estribos rectangulares con o sin estribos suplementarios de una
     rama, la armadura transversal requerida en los extremos de la longitud
     correspondiente a la zona de formación potencial de rótulas plásticas, no deberá ser
     menor que la dada por la expresión (7-12), ni menor que:

                                           Σ Ab f y     s
                                   Ate =                                           (7 - 14)
                                           135 f yt   6 db

     Deberá cumplirse con todo lo especificado en el artículo 7.3.3.6., esta reducción en la
     armadura transversal no deberá aplicarse en capitel y base de las columnas del
     primer piso, ni en aquellas secciones de columnas donde se prevea la formación de
     rótulas plásticas.

(d) Fuera de las zonas de formación potencial de rótulas plásticas de una columna o un
    pilote, la armadura transversal deberá cumplir con lo especificado en el artículo
    7.3.3.6. (c) y además:

     (i)   La separación entre centros de estribos circulares o en espiral, no deberá ser
           mayor que el menor valor entre un tercio del diámetro de la sección transversal
           del elemento y 10 veces el diámetro de la armadura longitudinal, ni menor que
           25 mm.

     (ii) La separación entre centros de capas de estribos rectangulares no deberá ser
          mayor que el menor valor entre 1/3 de la menor dimensión lateral de la sección
          transversal y 10 veces el diámetro de la armadura longitudinal a restringir.

     (iii) La separación entre centros de barras a través de la sección transversal no
           deberá ser mayor que el mayor valor entre 1/3 de la dimensión lateral de la
           sección transversal en la dirección de la separación y 200 mm.

     (iv) Cada barra o conjunto de barras deberá estar soportada lateralmente por la
          esquina de un estribo cerrado que tenga un ángulo no mayor a 135º o por un
          estribo suplementario de una rama, con excepción de los dos casos siguientes:

           - Barras o conjunto de barras que se encuentre entre 2 barras lateralmente
             soportadas o conjunto de barras soportadas por el mismo estribo cuando la
             distancia no sea mayor que el mayor valor entre 1/3 de la dimensión lateral de
             la sección transversal en la dirección de la separación o 200 mm.

           - Capas interiores de armaduras dentro del núcleo de hormigón que se
             encuentren a no más de 75 mm de la cara interior de los estribos.

(e) La armadura transversal dispuesta deberá considerase que contribuye a la resistencia
    al corte del elemento.

(f) Cuando las barras de la armadura longitudinal de columnas no se encuentren
    restringidas por vigas para prevenir el pandeo, la separación entre el primer estribo de

Reglamento INPRES-CIRSOC 103, Parte II                                            Cap. 7 - 85


<!-- page 103 -->

     la columna y el estribo ubicado dentro del nudo viga-columna, no deberá ser mayor
     que 10 veces el diámetro de la barra de la columna.


<a id="c7.3.3.7"></a>
### 7.3.3.7 Corte  <sub>p.104</sub>



<a id="c7.3.3.7.1"></a>
### 7.3.3.7.1 Para la determinación de los esfuerzos de corte de diseño en columnas, se  <sub>p.104</sub>

seguirán los criterios del diseño por capacidad. Deberán considerarse las solicitaciones
correspondientes al desarrollo de la sobrerresistencia flexional, junto con las cargas
gravitatorias mayoradas.


<a id="c7.3.3.7.2"></a>
### 7.3.3.7.2 La máxima demanda de corte no necesita ser mayor que la correspondiente a la  <sub>p.104</sub>

respuesta elástica.

<a id="c7.3.3.7.3"></a>
### 7.3.3.7.3 En elementos sometidos a flexión y corte con carga axial, donde la demanda de  <sub>p.104</sub>

ductilidad µ no sea mayor que 3, la contribución del hormigón a la resistencia al corte vc
en las zonas de formación potencial de rótulas plásticas, podrá tomarse:

(a) Para elementos sometidos a compresión axial:

                                             ⎡                      ⎤
                                     v c = ⎢ 0,50 + 1,50 P' u ⎥ v b ≥ 0           (7 - 15)
                                             ⎢               Ag fc ⎥⎦
                                             ⎣

     no siendo necesario tomar un valor menor que el dado por la expresión (2.3-24),
     donde vb está dado por la expresión (2.2-11).

(b) Para elementos sometidos a tracción axial:

                                             ⎡                      ⎤
                                     v c = ⎢ 0,50 + 6,00 P' u ⎥ v b ≥ 0           (7 - 16)
                                             ⎢               Ag fc ⎥⎦
                                             ⎣

     con Pu negativo para tracción


<a id="c7.4"></a>
### 7.4 TABIQUES SISMORRESISTENTES  <sub>p.104</sub>



<a id="c7.4.1"></a>
### 7.4.1 Requerimientos generales de diseño  <sub>p.104</sub>


Los tabiques sismorresistentes con ductilidad limitada, deberán cumplir con los
requerimientos siguientes:

(a) Los tabiques sismorresistentes en voladizo o acoplados, deberán considerarse como
    unidades integrales. La resistencia de las alas, elementos de borde y almas, deberán
    evaluarse sobre la base de una interacción homogénea compatible usando análisis
    racionales. Deberán tenerse en cuenta la presencia de aberturas.

(b) Los tabiques sismorresistentes diseñados con ductilidad limitada deberán ser capaces
    de disipar energía por fluencia en flexión de las armaduras longitudinales.


<!-- page 104 -->

(c) Los tabiques sismorresistentes con ductilidad limitada, deberán diseñarse por capacidad a
    fin de asegurar que la resistencia nominal al corte sea mayor que el esfuerzo de corte
    cuando se alcance la sobrerresistencia a flexión, teniendo en cuenta los efectos dinámicos.
    La resistencia al corte deberá determinarse de acuerdo con lo establecido en el artículo
    7.5.6.

(d) Cuando dos o más tabiques en voladizo se conecten en el mismo plano por vigas
    dúctiles, parte de la energía sísmica a disipar deberá asignarse al sistema de
    acoplamiento. Deberán utilizarse criterios de diseño por capacidad a fin de asegurar
    que la ductilidad del sistema de acoplamiento pueda mantenerse cuando se desarrolle
    la sobrerresistencia flexional. Si se requiere, deberá utilizarse armadura diagonal para
    resistir la flexión y el corte inducidos por la acción sísmica, de acuerdo con lo
    establecido en el artículo 7.5.7.

(e) La ductilidad global a adoptar no deberá ser mayor que 3 (µ ≤ 3).


<a id="c7.4.2"></a>
### 7.4.2 Limitaciones dimensionales  <sub>p.105</sub>


Deberán aplicarse las limitaciones dimensionales establecidas en el artículo 3.3., donde µ
deberá ser la utilizada para el diseño del tabique.


<a id="c7.4.3"></a>
### 7.4.3 Armadura longitudinal  <sub>p.105</sub>


El diámetro de la armadura longitudinal en cualquier sección del tabique, no deberá ser
mayor que 1/8 del espesor del tabique. En todo lo demás, deberá aplicarse lo establecido
en el artículo 3.5.4.


<a id="c7.4.4"></a>
### 7.4.4 Armadura transversal  <sub>p.105</sub>


La armadura transversal deberá cumplir los siguientes requerimientos:

(a) En zonas de fluencia potencial en compresión de la armadura longitudinal en tabiques
    con dos o más capas de armadura, cuando la cuantía de la armadura longitudinal ρl
    computada de acuerdo con la expresión (3-10) sea mayor que 3 / fy, deberá proveerse
    armadura transversal de acuerdo con lo establecido en el artículo 3.5.6, excepto en lo
    referido a la separación de los estribos, la cual deberá cumplir:

                                         s / db ≤ 10                                  (7 - 17)

(b) En todo lo demás, la armadura transversal deberá cumplir con lo especificado en el
    artículo 3.5.6. excepto que el límite crítico para la aplicación de lo especificado en el
    artículo 3.5.6.2. deberá tomarse igual a 3 / fy .


<a id="c7.4.5"></a>
### 7.4.5 Confinamiento de la zona comprimida  <sub>p.105</sub>


Los tabiques sismorresistentes con ductilidad limitada deberán cumplir con lo especificado
en el artículo 3.5.6.3. con las excepciones siguientes:

(a) Si la profundidad del eje neutro en la zona de formación potencial de rótula plástica,
    calculada con los esfuerzos de diseño correspondientes, no excede 0,80 veces el valor

Reglamento INPRES-CIRSOC 103, Parte II                                               Cap. 7 - 87


<!-- page 105 -->

    obtenido de la expresión (3-11), se permitirá la utilización de sólo una capa de
    armadura longitudinal en la zona de compresión, no necesitándose cumplir con los
    demás requerimientos especificados en el artículo 3.5.6.3.

(b) Si la profundidad del eje neutro en la zona de formación potencial de rótula plástica es
    igual o mayor que 0,80 veces el valor obtenido de la expresión (3-11), deberá
    cumplirse:

     (i)   Deberán proveerse 2 ó más capas de armadura longitudinal dentro de la zona de
           compresión por flexión. Además, una capa deberá ubicarse cerca de cada una de
           las caras del tabique.

     (ii) Deberá disponerse armadura transversal para confinar el hormigón del núcleo de
          la zona comprimida de acuerdo con lo especificado en el artículo 3.5.6.3. (ii) y
          (iii).

     (iii) Deberá prevenirse el pandeo de las barras longitudinales de acuerdo con lo
           especificado en el artículo 7.4.4.

     (iv) La separación entre centros de estribos no deberá ser mayor que 10 veces el
          diámetro de la menor barra longitudinal a restringir, o el espesor del tabique en la
          zona confinada o 200 mm.


<a id="c7.4.6"></a>
### 7.4.6 Corte  <sub>p.106</sub>



<a id="c7.4.6.1"></a>
### 7.4.6.1 La evaluación de la resistencia al corte, y la determinación de la armadura de corte  <sub>p.106</sub>

en tabiques sismorresistentes, deberá cumplir con lo especificado en el artículo 3.6.2. La
altura de la zona de formación potencial de rótulas plástica, deberá tomarse de acuerdo con
el artículo 3.5.6.2. (a-i).


<a id="c7.4.6.2"></a>
### 7.4.6.2 El corte máximo demandado en tabiques sismorresistentes con ductilidad limitada,  <sub>p.106</sub>

no necesita ser mayor que el correspondiente a la respuesta elástica.


<a id="c7.4.6.3"></a>
### 7.4.6.3 En las zonas extremas de un tabique sismorresistente, definida en el artículo  <sub>p.106</sub>

3.5.6.2.(a-i), sometidas a corte en el plano del tabique, la contribución del hormigón a la
resistencia al corte deberá tomarse:

                                                             ⎛             Pu ⎞⎟
                                     v c = ⎛⎜ 5 − µ ⎞⎟ ⎜⎜ 0 ,27   fc' +                     (7 - 18)
                                             ⎝    4     ⎠⎝                4 Ag ⎟⎠

y no necesita ser menor que la dada por la expresión (3-21).

Para tabiques sismorresistentes sometidos a tracción, el valor de Pu                en la expresión
(7-18) deberá tomarse con signo negativo.


<a id="c7.4.6.4"></a>
### 7.4.6.4 La tensión total de corte vn en la zona de formación potencial de rótula plástica en  <sub>p.106</sub>

un tabique sismorresistente, definida en el artículo 3.5.6.2 (a-i) no deberá ser mayor que el
valor establecido por la expresión (3-20).


<!-- page 106 -->


<a id="c7.4.6.5"></a>
### 7.4.6.5 La resistencia al corte de vigas de acoplamiento y la disposición de la armadura,  <sub>p.107</sub>

deberán estar de acuerdo con los requerimientos establecidos en el artículo 7.4.7.


<a id="c7.4.6.6"></a>
### 7.4.6.6 Los tabiques sismorresistentes poco esbeltos que posean fundaciones adecuadas  <sub>p.107</sub>

para posibilitar el desarrollo de una rótula plástica en la base, deberán diseñarse de
manera de asegurar que no ocurra una falla de corte por deslizamiento en la base antes
que se desarrolle la capacidad de ductilidad asignada. La resistencia al corte por
deslizamiento en la base del tabique, deberá basarse en un estudio especial.


<a id="c7.4.6.7"></a>
### 7.4.6.7 Cuando se apliquen los requerimientos establecidos en este Capítulo, no es  <sub>p.107</sub>

necesario cumplir con lo establecido en los artículos 2.2.8.3.2. a 2.2.8.3.4. relacionado
con la armadura diagonal.


<a id="c7.4.7"></a>
### 7.4.7 Tabiques acoplados  <sub>p.107</sub>


Para el diseño de las vigas de acoplamiento en tabiques sismorresistentes con ductilidad
limitada, se deberán aplicar las prescripciones siguientes:
(a) Los tabiques acoplados con ductilidad limitada, deberán estar conectados por vigas de
    acoplamiento dúctiles. En estas vigas, el corte y la flexión inducidos por la acción
    sísmica, deberán resistirse con armadura diagonal, a menos que la tensión de corte
    inducida sea menor que:

                                   v n = 0 ,10 ( 5 − µ ) Ln   fc'                (7 - 19)
                                                         h

     La armadura diagonal deberá estar circunscripta por estribos rectangulares o
     espirales que satisfagan los requerimientos establecidos en el artículo 3.5.6.

(b) Cuando se utilice armadura diagonal, deberán aplicarse los requerimientos de anclaje
    establecidos en el artículo 3.8.1.5.

(c) Si de acuerdo con la expresión (7-19) no se requiere armadura diagonal, las vigas de
    acoplamiento deberán diseñarse con armadura convencional consistente en armadura
    longitudinal para flexión y armadura transversal. El diseño de estas vigas deberá
    hacerse por capacidad, de acuerdo con lo especificado en el Capítulo 2.


<a id="c7.4.8"></a>
### 7.4.8 Empalmes  <sub>p.107</sub>


Los empalmes de la armadura deberán satisfacer lo especificado en el Capítulo 3 a
excepción de las modificaciones siguientes:

(a) Deberán evitarse, en la medida de lo posible, los empalmes por yuxtaposición en las
    zonas de formación potencial de rótulas plásticas. En la base de los elementos, donde
    pueden ocurrir plastificaciones, no deberá empalmares por yuxtaposición más de 1/2
    de la armadura. En esta zona ρl, incluyendo el área de las barras empalmadas, no
    deberá ser mayor que 21/ fy . Los empalmes deberán distribuirse tanto como sea
    posible a través del nivel considerado.

(b) La armadura principal podrá empalmarse en un nivel, en las zonas de formación
    potencial de rótulas plásticas, si el empalme es mecánico o soldado.

Reglamento INPRES-CIRSOC 103, Parte II                                          Cap. 7 - 89


<!-- page 107 -->

(c) Por encima de la zona de formación potencial de rótula plástica, toda la armadura
    longitudinal podrá empalmarse en un nivel.


<a id="c7.5"></a>
### 7.5 NUDOS VIGA-COLUMNA  <sub>p.108</sub>


Los nudos viga-columna en estructuras con ductilidad limitada, deberán cumplir con los
requisitos especificados en el artículo 2.4.


<a id="c7.6"></a>
### 7.6 DIAFRAGMAS  <sub>p.108</sub>


El diseño de diafragmas correspondientes a estructuras con ductilidad limitada, deberá
cumplir con lo especificado en el Capítulo 5.


<!-- page 108 -->

REFERENCIAS:

1)   Reglamento Argentino de Estructuras de Hormigón, CIRSOC 201-2005.
2)   Comentarios al Reglamento Argentino de Estructuras de Hormigón, CIRSOC 201-
     2005.
3)   New Zealand Standard, Concrete Structures Standard Part 1 – The Design of
     Concrete Structures (NZS 3101: Part 1:1995).
4)   New Zealand Standard, Concrete Structures Standard
     Part 2 – Commentary on The Design of Concrete Structures (NZS 3101: Part 2:1995).
5)   Building Code Requirements For Structural Concrete (ACI-318-02) and Commentary.
6)   Seismic Design of Reinforced Concrete and Masonry Buildings, T. Paulay and M.J.N.
     Priestley, 1992.

Reglamento INPRES-CIRSOC 103, Parte II                                   Referencias - 91


<!-- page 109 -->



<!-- page 110 -->
