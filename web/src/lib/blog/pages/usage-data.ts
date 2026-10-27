import type { StandingPage } from './cirsoc';

export const usageDataPage: StandingPage = {
  path: '/usage-data',
  updated: '2026-10-27',
  i18n: {
    es: {
      title: 'Qué datos de uso anónimos envía Stabileo',
      description: 'La lista completa de los datos de uso anónimos que envía Stabileo, de lo que no envía nunca y de cómo desactivarlo.',
      eyebrow: 'Privacidad',
      lead: 'Stabileo comparte datos de uso anónimos de forma predeterminada, y lo podés desactivar cuando quieras desde el aviso o en Configuración. Sirven para saber qué herramientas se usan y cuáles fallan, y así decidir qué mejorar primero. Esta es la lista completa de lo que se envía.',
      blocks: [
        { k: 'h', t: 'Lo que se envía' },
        {
          k: 'ul',
          items: [
            'Qué herramienta elegís (por ejemplo, barra, apoyo o carga) y qué diagrama mostrás.',
            'Cada cálculo: si salió bien o con error, cuánto tardó, si fue 2D o 3D y el tamaño del modelo en rangos (por ejemplo, de 11 a 50 barras).',
            'Los ejemplos que abrís, los análisis avanzados y los métodos del paso a paso que usás.',
            'Las exportaciones, con su formato.',
            'El modo (Básico o PRO), la versión de la aplicación y el idioma.',
            'Un identificador aleatorio de esta visita. Si respondés el aviso con «Entendido», también uno de este navegador, que se guarda en él para contar navegadores distintos. Ninguno se vincula con tu cuenta.',
          ],
        },
        { k: 'h', t: 'Lo que no se envía nunca' },
        {
          k: 'ul',
          items: [
            'La geometría, las cargas, las secciones ni ningún valor de tus modelos.',
            'Los nombres de tus proyectos o archivos.',
            'Tu nombre, tu email ni tu dirección IP junto con los eventos.',
          ],
        },
        { k: 'h', t: 'Cuánto tiempo se guarda' },
        { k: 'p', t: 'Los eventos se guardan hasta trece meses y se analizan de forma agregada.' },
        { k: 'h', t: 'Cómo cambiarlo' },
        { k: 'p', t: 'Con «Desactivar» en el aviso, en Configuración, en la sección Privacidad, o en tu perfil si tenés cuenta. Si dejás de compartir, los eventos que todavía no se enviaron se descartan.' },
      ],
      faqTitle: 'Preguntas frecuentes',
      faq: [],
    },
    en: {
      title: 'What anonymous usage data Stabileo sends',
      description: 'The complete list of the anonymous usage data Stabileo sends, what it never sends, and how to turn it off.',
      eyebrow: 'Privacy',
      lead: 'Stabileo shares anonymous usage data by default, and you can turn it off at any time from the notice or in Settings. It tells us which tools are used and which ones fail, so we can decide what to improve first. This is the complete list of what is sent.',
      blocks: [
        { k: 'h', t: 'What is sent' },
        {
          k: 'ul',
          items: [
            'Which tool you pick (for example member, support or load) and which diagram you show.',
            'Each calculation: whether it succeeded or failed, how long it took, whether it was 2D or 3D, and the size of the model in ranges (for example, 11 to 50 members).',
            'The examples you open, the advanced analyses and the step-by-step methods you use.',
            'Exports, with their format.',
            'The mode (Basic or PRO), the app version and the language.',
            'A random id for this visit. If you answer the notice with “Got it”, also one for this browser, stored in it to count distinct browsers. Neither is linked to your account.',
          ],
        },
        { k: 'h', t: 'What is never sent' },
        {
          k: 'ul',
          items: [
            'Geometry, loads, sections or any value from your models.',
            'The names of your projects or files.',
            'Your name, your email or your IP address together with the events.',
          ],
        },
        { k: 'h', t: 'How long it is kept' },
        { k: 'p', t: 'Events are kept for up to thirteen months and analyzed in aggregate.' },
        { k: 'h', t: 'How to change it' },
        { k: 'p', t: "With “Turn off” on the notice, in Settings under Privacy, or in your profile if you have an account. If you stop sharing, events that haven't been sent yet are discarded." },
      ],
      faqTitle: 'Frequently asked questions',
      faq: [],
    },
    pt: {
      title: 'Quais dados de uso anônimos o Stabileo envia',
      description: 'A lista completa dos dados de uso anônimos que o Stabileo envia, do que ele nunca envia e de como desativar.',
      eyebrow: 'Privacidade',
      lead: 'O Stabileo compartilha dados de uso anônimos por padrão, e você pode desativar quando quiser pelo aviso ou em Configurações. Servem para saber quais ferramentas são usadas e quais falham, e assim decidir o que melhorar primeiro. Esta é a lista completa do que é enviado.',
      blocks: [
        { k: 'h', t: 'O que é enviado' },
        {
          k: 'ul',
          items: [
            'Qual ferramenta você escolhe (por exemplo, barra, apoio ou carga) e qual diagrama você mostra.',
            'Cada cálculo: se deu certo ou com erro, quanto demorou, se foi 2D ou 3D e o tamanho do modelo em faixas (por exemplo, de 11 a 50 barras).',
            'Os exemplos que você abre, as análises avançadas e os métodos do passo a passo que você usa.',
            'As exportações, com o formato.',
            'O modo (Básico ou PRO), a versão do aplicativo e o idioma.',
            'Um identificador aleatório desta visita. Se você responder ao aviso com “Entendi”, também um deste navegador, guardado nele para contar navegadores distintos. Nenhum é vinculado à sua conta.',
          ],
        },
        { k: 'h', t: 'O que nunca é enviado' },
        {
          k: 'ul',
          items: [
            'A geometria, as cargas, as seções ou qualquer valor dos seus modelos.',
            'Os nomes dos seus projetos ou arquivos.',
            'Seu nome, seu e-mail ou seu endereço IP junto com os eventos.',
          ],
        },
        { k: 'h', t: 'Por quanto tempo é guardado' },
        { k: 'p', t: 'Os eventos são guardados por até treze meses e analisados de forma agregada.' },
        { k: 'h', t: 'Como mudar' },
        { k: 'p', t: 'Com “Desativar” no aviso, em Configurações, na seção Privacidade, ou no seu perfil se você tiver conta. Se você deixar de compartilhar, os eventos ainda não enviados são descartados.' },
      ],
      faqTitle: 'Perguntas frequentes',
      faq: [],
    },
  },
};
