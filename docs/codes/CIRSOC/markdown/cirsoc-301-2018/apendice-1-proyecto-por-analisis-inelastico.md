# CIRSOC 301 (2018) — APÉNDICE 1. PROYECTO POR ANÁLISIS INELÁSTICO

> Source: `CIRSOC 301-2018.pdf` · PDF pages 261–268
> Extraction: `pdftotext -layout` text layer, verbatim. No text was rewritten or inferred.

Este Apéndice contiene las especificaciones para el Proyecto de Estructuras por
análisis global inelástico. En él se permite la consideración de redistribuciones de fuerzas
y momentos flectores en miembros y uniones como resultado de fluencias localizadas.

Su contenido se organiza de la siguiente forma:


<a id="c1.1"></a>
### 1.1 Especificaciones generales  <sub>p.261</sub>


<a id="c1.2"></a>
### 1.2 Requerimientos de ductilidad  <sub>p.261</sub>


<a id="c1.3"></a>
### 1.3 Requerimientos para el análisis estructural.  <sub>p.261</sub>



<a id="c1.1"></a>
### 1.1 ESPECIFICACIONES GENERALES  <sub>p.261</sub>


   Las resistencias de diseño de la estructura, sus miembros componentes y sus uniones
    serán mayores o iguales que las resistencias requeridas determinadas por análisis
    estructural inelástico para la combinación crítica de las acciones mayoradas especificada
    en la Sección B.2.2..

    Para el Proyecto de Estructuras sometidas a acciones sísmicas se deberán aplicar
    además las especificaciones del Reglamento INPRES-CIRSOC 103 - Parte I y del
    Reglamento INPRES-CIRSOC 103- Parte IV - Construcciones de Acero.

   El análisis global inelástico deberá tener en cuenta:

    (1) Las deformaciones por flexión, por corte, y por fuerza axil de los miembros de la
        estructura, y toda otra deformación de otro componente o unión que pueda contribuir
        al desplazamiento de la estructura.
    (2) Los efectos de Segundo Orden (P- y P- ).
    (3) Las imperfecciones geométricas iniciales.
    (4) Las reducciones de rigidez por inelasticidad, incluyendo el efecto de las tensiones
        residuales y la fluencia parcial de las secciones transversales.
    (5) Incertidumbres en la resistencia y rigidez de la estructura, sus miembros y sus
        uniones.

   Los estados límite últimos (de resistencia) detectados por un análisis global inelástico
    que satisfaga todos los requisitos indicados más arriba, no están sometidos a las
    especificaciones del Reglamento cuando el análisis proporcione un nivel de confiabilidad
    similar o más elevado. Los estados límite últimos no detectados por el análisis inelástico
    serán evaluados con las especificaciones correspondientes de los Capítulos D, E, F, G,
    H y J.

   Las uniones deberán satisfacer las especificaciones de la Sección B.3.4..

   Los miembros y uniones sometidos a deformaciones inelásticas deben tener una
    ductilidad adecuada, que sea consistente con el comportamiento supuesto del sistema

Reglamento CIRSOC 301 – 2018                                                  Apéndice 1 - 207


<!-- page 261 -->

    estructural. No se permite ninguna redistribución de fuerzas resultante de la rotura de
    un miembro o unión.

   Para dimensionar los miembros y uniones de una estructura se permite el uso de
    cualquier método que utilice un análisis global inelástico que satisfaga las
    especificaciones generales contenidas en esta Sección. Cualquier método de proyecto
    basado en un análisis inelástico que satisfaga los requerimientos de resistencia arriba
    enunciados, las especificaciones sobre ductilidad contenidas en la Sección 1.2., y las
    especificaciones sobre el análisis dadas en la Sección 1.3., satisface las especificacio-
    nes generales contenidas en esta Sección.

   Se deberá proveer un arriostramiento lateral en toda ubicación de una rótula
    plástica que ocurra bajo cualquier combinación de carga. La distancia máxima entre
    el arriostramiento y la ubicación teórica de la rótula, medida a lo largo del eje, será
    menor o igual a la mitad de la altura del miembro.

   No se deberá usar el análisis inelástico en estructuras sometidas a efectos de
    cargas cíclicas (fatiga).


<a id="c1.2"></a>
### 1.2 REQUERIMIENTOS DE DUCTILIDAD  <sub>p.262</sub>


Los miembros y uniones con elementos sometidos a la tensión de fluencia deberán ser
dimensionados de manera que toda deformación inelástica requerida en ellos sea menor o
igual a su capacidad de deformación inelástica. En vez de asegurar explícitamente el
cumplimiento de lo anterior, podrá considerarse que los miembros de acero donde se
ubiquen rótulas plásticas deberán satisfacer las siguientes especificaciones:


<a id="c1.2.1"></a>
### 1.2.1 Material  <sub>p.262</sub>


El acero de miembros de la estructura donde se ubiquen rótulas plásticas deberá cumplir:

                 Fy  450 MPa
                 Fu / Fy  1,25
                 u / y  20

siendo:

          Fu   la tensión de rotura especificada del acero, en MPa.

          Fy   la tensión de fluencia mínima especificada del acero, en MPa.

          u   la deformación específica correspondiente a Fu (%).

          y   la deformación específica correspondiente a Fy (%).


<a id="c1.2.2"></a>
### 1.2.2 Sección transversal del miembro. Relación ancho-espesor de elementos compri-  <sub>p.262</sub>

midos

La sección transversal de aquellos miembros donde se ubiquen rótulas plásticas deberá
verificar lo siguiente:


<!-- page 262 -->

(1) ser de doble simetría
(2) la relación ancho-espesor de sus elementos comprimidos deberá ser menor o igual que
    pp. Ello supone una capacidad de rotación inelástica de 7 veces la rotación elástica.

La relación ancho-espesor pp será:

(a) Alas comprimidas de perfiles doble Te laminados y armados, y alas salientes de
    secciones armadas de doble simetría

                                                       E
        = b/t  pp                   pp= 0 , 30                                                       (1.1)
                                                      Fy

   siendo:

         b y t el ancho y el espesor del ala según los Casos 11 y 12, Tabla B.4.1b, en cm.

(b) Almas de secciones doble Te laminadas y armadas, de cajón armadas de doble simetría
    y de tubos RHS sin costura sometidas a flexión y compresión:

                                = h/tw  pp

                                                                            
                                                       E    1 , 54 P u      
   (b.1) Para Pu / c Py  0,125       pp = 3 , 06      1                                             (1.2)
                                                      Fy      c Py         
                                                                            

                                                                                
                                                       E             Pu                       E
   (b.2) Para Pu / c Py > 0,125       pp= 4 , 78        0 , 64                 1 , 49               (1.3)
                                                      Fy            c Py                    Fy
                                                                                

   siendo:

         h y tw la altura y espesor del alma según los Casos 16, 20 y 21, Tabla B.4.1b., en
                cm.

         Pu      la resistencia requerida a compresión axil, en kN.

         Py      la resistencia axil a fluencia = Fy Ag (10)-1, en kN.

         c      el factor de resistencia a compresión axil.

(c) Alas comprimidas de secciones cajón soldadas y de tubos RHS sin costura,
    platabandas y placas diafragmas entre líneas de pasadores o cordones de soldadura:

                                                      E
         = b/t  pp                 pp= 0 ,939                                                         (1.4)
                                                      Fy
   siendo:

Reglamento CIRSOC 301 – 2018                                                                  Apéndice 1 - 209


<!-- page 263 -->

           byt       el ancho y el espesor del ala según los Casos 18, 19 y 22, Tabla B.4.1b, en
                     cm.

(d) Tubos circulares en flexión

          = D/t  pp                     pp= 0,045 E / Fy                                  (1.5)

      siendo:

                D y t el diámetro y el espesor de pared del tubo, Caso 23, Tabla B.4.1b., en cm.

(e) En aquellos miembros donde la sección transversal sea variable a lo largo de su
    longitud, se deberá satisfacer el siguiente criterio adicional:

      (e.1) En las adyacencias a la ubicación de la rótula plástica, no se deberá reducir la
            altura y el espesor del alma en una distancia por lo menos de 2d desde la posición
            de la rótula plástica, medida a lo largo de la viga, siendo d la altura del alma en la
            ubicación de la rótula.
      (e.2) En las adyacencias a la posición de la rótula plástica, la relación ancho/espesor del
            ala comprimida debe ser menor o igual a pp hasta una distancia a lo largo del
            miembro no menor al mayor de los valores siguientes:
            - 2d, con d como se definió en el ítem (e.1.).
            - el punto donde el momento flector toma el valor de 0,80 del momento plástico en
              la sección de la rótula.
      (e.3) En cualquier otra sección del miembro la relación ancho/espesor del ala
            comprimida deberá ser menor o igual que p, y la relación ancho/espesor del alma
            deberá ser menor o igual que p.


<a id="c1.2.3"></a>
### 1.2.3 Longitud lateralmente no arriostrada  <sub>p.264</sub>


En segmentos de miembros prismáticos que contengan rótulas plásticas asociadas al meca-
nismo de falla la longitud lateralmente no arriostrada Lb debe ser menor o igual que Lpd.

Para miembros sometidos solo a flexión, o a flexión y tracción axil, Lb será tomada como la
distancia entre puntos arriostrados contra el desplazamiento lateral del ala comprimida o
entre los puntos arriostrados para prevenir el giro de la sección transversal.

Para miembros sometidos a flexión y compresión axil, Lb se tomará como la distancia entre
puntos arriostrados contra los desplazamientos laterales en la dirección normal del eje débil
y contra el giro de la sección transversal.

(a)    para miembros de sección doble Te de doble simetría cargados en el plano del alma
       y flexados alrededor del eje fuerte:

                                          M '   E 
                   Lpd  0 ,12  0 ,076  1     ry                         (1.6)
                                                    
                                           M 2    Fy 

         siendo:

                   ry el radio de giro de la sección transversal respecto del eje principal de
                      menor inercia (eje débil), en cm.


<!-- page 264 -->

(1) Cuando la magnitud del momento flector en cualquier punto dentro de la longitud no
    arriostrada sea mayor que M2

                          M´1 / M2 = 1                                                          (1.7a)

(2) Cuando Mmid  (M1 + M2) / 2

                          M´1 = M1                                                              (1.7b)

(3) Cuando Mmid > (M1 + M2) /2

                          M´1 = 2Mmid – M2 < M2                                                 (1.7c)

    siendo:

           M1       el menor momento en el extremo de la longitud no arriostrada, en kNm.

           M2       el mayor momento en el extremo de la longitud no arriostrada, en kNm.
                    M2 será tomado como positivo en todos los casos.

           Mmid     el momento en la mitad de la longitud no arriostrada, en kNm.

           M´1      el momento efectivo en el extremo opuesto a M2 , en kNm.

    Los momentos M1 y Mmid son tomados individualmente como positivos cuando ellos
    causan compresión en el mismo ala que M2. En caso contrario se tomarán como
    negativos.

(b) Para miembros de sección rectangular maciza y de sección cajón simétrica flexada
    alrededor del eje fuerte:

                                           M ´      
                                                          
                                                                       
                                                                        E
                                                                              
                                                                              
                                           1  E
                  L pd   0 , 17  0 , 10             y
                                                            r  0 , 10        ry               (1.8)
                                          M  F                   Fy   
                                            2  y                        

   Para todos los tipos de miembros sometidos a compresión axil y que contengan rótulas
    plásticas, las longitudes no arriostradas para la flexión alrededor del eje fuerte y para la
    flexión alrededor del eje débil, deberán ser menores o iguales que 4 , 71 r x E / F y y

    4 , 71 r y   E / F y respectivamente.

   No hay límite para Lb en segmentos de miembros que contengan rótulas plásticas en los
    casos siguientes:

    (1) Miembros con sección transversal circular o cuadrada sometidos solo a flexión o a la
        combinación de flexión y tracción.

Reglamento CIRSOC 301 – 2018                                                         Apéndice 1 - 211


<!-- page 265 -->

    (2) Miembros solicitados solo a flexión alrededor de su eje débil o a la combinación de
        flexión alrededor del eje débil y tracción.

    (3) Miembros solicitados solo a tracción.


<a id="c1.2.4"></a>
### 1.2.4 Resistencia de diseño a compresión axil  <sub>p.266</sub>


Para asegurar una adecuada ductilidad en miembros comprimidos que contengan rótulas
plásticas la resistencia de diseño a compresión axil Pd (kN) deberá ser:

                                  Pd  0,75 Fy Ag (10)-1

siendo:

          Fy     la tensión de fluencia mínima especificada del acero, en MPa.

          Ag     la sección bruta del miembro, en cm2.


<a id="c1.3"></a>
### 1.3 REQUERIMIENTOS PARA EL ANÁLISIS ESTRUCTURAL  <sub>p.266</sub>


El análisis estructural deberá satisfacer las especificaciones generales dadas en la Sección
1.1.. Dichas especificaciones se consideran cumplidas si se realiza un análisis inelástico de
segundo orden que cumpla las especificaciones de esta Sección.

Como excepción, para vigas continuas no sometidas a compresión axil, se permite
realizar un análisis inelástico de primer orden (análisis plástico tradicional), sin necesidad
de cumplir lo especificado en las Secciones 1.3.2. y 1.3.3..


<a id="c1.3.1"></a>
### 1.3.1 Propiedades de los materiales y criterio de consideración de la fluencia  <sub>p.266</sub>


La tensión de fluencia mínima especificada Fy y la rigidez de todos los miembros de acero y
sus uniones, serán reducidos para el análisis por el factor 0,90, con la excepción indicada en
la Sección 1.3.3..

La influencia de la fuerza axil, del momento flector alrededor del eje fuerte y del momento
flector alrededor del eje débil deberán ser incluidos en la determinación de la respuesta
inelástica.

La resistencia plástica de la sección transversal de los miembros deberá ser representada
en el análisis. Ello puede realizarse con un criterio de fluencia elástico-perfectamente
plástico expresado en términos de fuerza axil, momento flector alrededor del eje fuerte y
momento flector alrededor del eje débil, o mediante un modelo explícito de la curva de
respuesta tensión-deformación del material como elástico-perfectamente plástico.


<a id="c1.3.2"></a>
### 1.3.2 Imperfecciones geométricas iniciales  <sub>p.266</sub>


El análisis deberá incluir la consideración de las imperfecciones geométricas iniciales. Ello
podrá ser realizado ya sea con el modelado explícito de las imperfecciones como se
especifica en la Sección C.2.2a o por la aplicación de cargas ficticias como se especifica en
la Sección C.2.2b..


<!-- page 266 -->


<a id="c1.3.3"></a>
### 1.3.3 Efectos de las tensiones residuales y de la fluencia parcial  <sub>p.267</sub>


El análisis deberá incluir los efectos de las tensiones residuales y de la fluencia parcial. Ello
podrá realizarse mediante el modelado explícito de dichos efectos en el análisis o por la
reducción de la rigidez de todos los componentes de la estructura tal como se especifica en
la Sección C.2.3..

Si se aplican las especificaciones de la Sección C.2.3. entonces:

   (1) El factor de reducción de la rigidez de 0,9 especificado en la Sección 1.3.1. será
       reemplazado por un factor de 0,8 aplicado al módulo de elasticidad longitudinal E,
       tal como se especifica en la Sección C.2.3., y

   (2) El criterio de fluencia elástico-perfectamente plástico expresado en términos de
       fuerza axil, momento flector alrededor del eje fuerte y momento flector alrededor del
       eje débil deberá satisfacer el estado límite de resistencia de la sección transversal
       definido por las expresiones (H.1.1a) y (H.1.1b) del Capítulo H, usando Pd = 0,9 Py ,
       Mdx = 0,9 Mpx y Mdy = 0,9 Mpy .

Reglamento CIRSOC 301 – 2018                                                    Apéndice 1 - 213


<!-- page 267 -->



<!-- page 268 -->
