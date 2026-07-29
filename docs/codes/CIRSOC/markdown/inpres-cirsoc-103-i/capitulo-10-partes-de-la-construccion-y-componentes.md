# INPRES-CIRSOC 103 Parte I (2018) — CAPÍTULO 10. PARTES DE LA CONSTRUCCIÓN Y COMPONENTES

> Source: `INPRES-CIRSOC-103_Parte_I-Reglamento.pdf` · PDF pages 91–96
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

NO ESTRUCTURALES


<a id="c10.0"></a>
### 10.0 SIMBOLOGÍA  <sub>p.91</sub>


 Ca       parámetro característico del espectro de diseño.

 Cpk      coeficiente sísmico de diseño para la parte o componente.

 Fp       fuerza sísmica de la parte de la construcción.

 Ip       factor de importancia del componente no estructural.

 Lp       distancia del centro de masa del componente al vínculo de fijación.

 Rp       factor de modificación de respuesta de la parte o componente no estructural.

 Wp       peso de la parte o componente que se estudia.

 H        altura total de la construcción sobre el nivel de referencia.

 dep      deformaciones elásticas en la parte o componente debidas a Fp.

 dup      deformaciones últimas en la parte o componente debidas a Fp.

 ap       factor de amplificación dinámica.

 fhk      factor de magnificación en altura.

 z        altura donde se ubica la parte o componente medida desde el nivel de referencia.

 up      distorsión última de la parte o componente no estructural.

 pmáx distorsión máxima de la parte o componente no estructural.


<a id="c10.1"></a>
### 10.1 ALCANCE  <sub>p.91</sub>


Este capítulo establece los criterios mínimos de diseño para componentes que estén fijados
a la estructura principal de forma permanente, sean o no estructurales. Se aplica a todo
elemento vinculado cuyo peso es hasta el 25% del peso sísmico efectivo del nivel al que
está unido en la estructura principal.

Cuando el peso del componente es mayor al 25% del peso sísmico efectivo del nivel al que
está unido en la estructura principal se deberá analizar la construcción en conjunto con
masas o pesos independientes para los componentes o subconjuntos.

Las partes, componentes o elementos, deben ser vinculados directa o indirectamente a la
estructura principal. Los componentes, sus soportes y fijaciones deben ser diseñados y
dimensionados para soportar las acciones establecidas en este capítulo.

Reglamento INPRES-CIRSOC 103, Parte I                                              Cap. 10 - 73


<!-- page 91 -->

La aplicación de estas disposiciones a componentes o elementos tales como equipos
eléctricos o mecánicos es responsabilidad de los especialistas encargados de su diseño o
provisión o, en su defecto, del propietario.

Las disposiciones de este capítulo no son aplicables a construcciones del Grupo C.


<a id="c10.2"></a>
### 10.2 EVALUACIÓN DE LA ACCIÓN SÍSMICA SOBRE PARTES DE LA  <sub>p.92</sub>

      CONSTRUCCIÓN

Todo componente o parte debe diseñarse para resistir una fuerza horizontal Fp definida por
la expresión 10.1.
                                              Fp  Cpk Wp                            [10.1]

                                                        Ca a p fhk
                                           C pk  I p                                [10.2]
                                                             Rp

Con                                    0,75 Ca Ip ≤ Cpk ≤ 4,00 Ca Ip                 [10.3]

Cada parte o componente debe ser analizado en todas las direcciones horizontales en que
es posible el movimiento relativo respecto de la masa o construcción principal a la que está
fijado. Para componentes con posibilidad de vibración en dirección vertical se aplicarán los
artículos 3.5.2. y 6.3.


<a id="c10.2.1"></a>
### 10.2.1 Factor de importancia  <sub>p.92</sub>


El componente es de “Importancia Alta” con factor de importancia Ip1,5 cuando:

    a) Se requiere la integridad del componente para la seguridad de vida de los ocupantes
         de la construcción luego de un terremoto; por ejemplo: dispositivos del sistema
         contra incendio, escaleras de emergencia.

    b) Los componentes llevan o contienen sustancias tóxicas, explosivas o altamente
         peligrosas.

    c) El componente forma parte de una construcción del grupo Ao.

En todos los otros casos el componente es de “Importancia Normal” con factor de
importancia Ip1,0.


<a id="c10.2.2"></a>
### 10.2.2 Factor de amplificación dinámica  <sub>p.92</sub>


El factor de amplificación dinámica ap tiene en cuenta la relación de frecuencias entre el o
los modos de vibración de la estructura principal y el modo de vibración del componente. Su
valor se obtendrá de la Tabla 10.1 y 10.2.


<!-- page 92 -->


<a id="c10.2.3"></a>
### 10.2.3 Factor de modificación de respuesta  <sub>p.93</sub>


El factor de modificación de respuesta Rp se obtendrá de las Tablas 10.1 y 10.2. Para los
componentes o partes que puedan afectar a otros de mayor riesgo se utilizará el menor
factor correspondiente a los elementos afectados. Para casos no contemplados en las
Tablas 10.1 y 10.2 el proyectista podrá asignar el factor por analogía a casos similares o
bien adoptar un factor de reducción en función del tipo estructural que sustenta el
componente con un valor igual al 50% de los valores fijados en la Tabla 5.1, pero nunca
mayor a 3. En los casos que se requiera comportamiento elástico se podrá utilizar el valor
de Rp1.

           Tabla 10.1. Factor de riesgo y modificación de respuesta para componentes
                                             arquitectónicos

                          Sistemas o componentes arquitectónicos                  ap         Rp


<a id="c1"></a>
### 1 Muros exteriores de mampostería en general                           1,0        1,5  <sub>p.93</sub>



<a id="c2"></a>
### 2 Muros interiores de mampostería en general                           1,0        2,0  <sub>p.93</sub>

             Paredes de paneles de yeso o paneles frágiles con peso menor a
       3              2                                                           1,0        2,5
             0,4 kN/m
                                                                      2

<a id="c4"></a>
### 4 Paredes de paneles dúctiles con peso menor a 0,4 kN/m                1,0        3.0  <sub>p.93</sub>

                                                                                                   (1)

<a id="c5"></a>
### 5 Señalizaciones y cartelería                                          2,5      ≤3,0  <sub>p.93</sub>



<a id="c6"></a>
### 6 Cielorrasos suspendidos de materiales frágiles                       1,0        2,0  <sub>p.93</sub>



<a id="c7"></a>
### 7 Cielorrasos suspendidos de materiales dúctiles                       1,0        2,5  <sub>p.93</sub>



<a id="c8"></a>
### 8 Ventanas, carpinterías, muros cortina                                1,5        1,5  <sub>p.93</sub>


             Cuerpo emergente de azotea o cubierta, chimeneas, torres de
             enfriamiento, tanques de agua, parapetos, etc.
       9                                                                                           (1)
             a) Próximos al perímetro de la construcción                          2,5      ≤3,0
                                                                                                (1)
             b) Otros casos                                                       2.0      ≤3,0
             Elementos o componentes colgantes
                                                                                                   (1)
   10        a) En el exterior                                                    1,5      ≤3,0
                                                                                                (1)
             b) En el interior de locales                                         1,0      ≤3,0
             Escaleras de emergencia que no forman parte de la estructura                          (1)
   11                                                                             1,0      ≤3,0
             principal

<a id="c12"></a>
### 12 Accesorios y adornos                                                 2,5        2.5  <sub>p.93</sub>



<a id="c13"></a>
### 13 Rampas de accesos y pasarelas                                        1,0        1,5  <sub>p.93</sub>

             Cabinas y casillas con altura superior a 1,80 m, incluido sus
   14                                                                             1,0        2,5
             contenidos
             Bibliotecas o estanterías para objetos con peso específico mayor a
   15                 3                                                           1,0        2,5
             10 kN/m en el interior de locales
 (1)
   Se definirá como el 50% del valor correspondiente al tipo estructural de la parte o componente
 según la tabla 5.1 con el límite superior indicado en esta tabla.
Reglamento INPRES-CIRSOC 103, Parte I                                                   Cap. 10 - 75


<!-- page 93 -->

        Tabla 10.2. Factor de riesgo y modificación de respuesta para componentes
                                           mecánicos y eléctricos

                     Sistemas o Componentes Mecánicos y Eléctricos                   ap         Rp

           Equipos de acondicionamiento de aire, ventiladores y otros equipos
    1                                                                                2,5        6,0
           construidos con chapas de acero conformado

<a id="c2"></a>
### 2 Calderas, hornos, tanques enfriadores, calentadores de agua               1,0        2,5  <sub>p.94</sub>



<a id="c3"></a>
### 3 Motores, bombas, turbinas, compresores                                    1,0        2,5  <sub>p.94</sub>



<a id="c4"></a>
### 4 Equipos de laboratorio                                                    1,0        2,5  <sub>p.94</sub>

           Recipientes para gases, líquidos o materiales sueltos apoyados sobre
    5                                                                                1,0        2,5
           el piso
           Recipientes para gases, líquidos o materiales sueltos apoyados sobre
    6                                                                                2,5        2,5
           soportes

<a id="c7"></a>
### 7 Ascensores y montacargas                                                  1,0        2,5  <sub>p.94</sub>

           Equipos de comunicación, informáticos, instrumentos de medición y
    8                                                                                1,0        2,5
           sistemas de control

<a id="c9"></a>
### 9 Equipos y sistemas de potencia eléctrica: subestaciones, tableros, etc.   1,0        2,5  <sub>p.94</sub>



<a id="c10"></a>
### 10 Torres y antenas de trasmisión construidas de materiales dúctiles         2,5        3,0  <sub>p.94</sub>



<a id="c11"></a>
### 11 Artefactos de iluminación                                                 1,0        1,5  <sub>p.94</sub>

           Ductos y tuberías construidas de materiales frágiles como vidrio,
   12                                                                                2,5        3,0
           plástico no dúctil, fundición de acero

<a id="c13"></a>
### 13 Ductos, tuberías y sus fijaciones construidas de materiales dúctiles      2,5        6,0  <sub>p.94</sub>



<a id="c10.2.4"></a>
### 10.2.4 Factor de magnificación en altura  <sub>p.94</sub>


El factor de magnificación en altura fhk para cada nivel k se determinará mediante la
siguiente expresión.
                                                              z
                                                fhk  1  2                                  [10.4]
                                                              H


<a id="c10.3"></a>
### 10.3 SOPORTES, VÍNCULOS Y FIJACIONES  <sub>p.94</sub>


Los soportes, vínculos y fijaciones de la parte o componente deben resistir las solicitaciones
que origine la fuerza Fp definida en 10.2. Las fuerzas por fricción debidas a las acciones
gravitatorias no se tomarán en cuenta para el diseño y verificación de soportes, vínculos y
fijaciones. Los vínculos y las uniones se dimensionarán de acuerdo con las Partes II, III y IV
de este Reglamento.


<!-- page 94 -->


<a id="c10.4"></a>
### 10.4 DEFORMACIONES  <sub>p.95</sub>


Se deben verificar los efectos de las deformaciones de las partes o componentes y de sus
soportes y vínculos, en particular por los posibles golpes o daños del componente o de
elementos adyacentes debidos a la deformación. Las deformaciones últimas se
determinarán mediante la siguiente expresión:

                                               dup  1,2 d ep Rp                     [10.5]

Las distorsiones últimas up, calculadas como la deformación última dup dividida por la
distancia del vínculo al centro de masa de la parte en estudio Lp, no podrán exceder los
valores de la Tabla 10.3.

                                          up  dup Lp   pmáx                      [10.6]

                             Tabla 10.3. Distorsión máxima permitida

                                        Grupo       Distorsión máxima
                                        destino           pmáx

                                          Ao              1,0 %

                                          A               1,5 %

                                          B               2,0 %


<a id="c10.5"></a>
### 10.5 ANÁLISIS POR MÉTODOS DINÁMICOS  <sub>p.95</sub>


Las partes o componentes y sus vínculos a la construcción pueden ser analizados por
métodos dinámicos del capítulo 7, para ello se utilizarán los espectros de diseño del capítulo

<a id="c3"></a>
### 3 El factor de importancia y el factor de modificación de respuesta deben responder a lo  <sub>p.95</sub>

establecido en este capítulo.

Reglamento INPRES-CIRSOC 103, Parte I                                              Cap. 10 - 77


<!-- page 95 -->



<!-- page 96 -->
