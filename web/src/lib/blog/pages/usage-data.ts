import type { StandingPage } from './cirsoc';

export const usageDataPage: StandingPage = {
  path: '/usage-data',
  updated: '2026-10-27',
  i18n: {
    es: {
      title: 'Qué envía Stabileo cuando compartís uso anónimo',
      description: 'La lista completa de lo que Stabileo envía si aceptás compartir uso anónimo, y de lo que no envía nunca.',
      eyebrow: 'Privacidad',
      lead: 'Compartir uso anónimo es opcional y lo podés cambiar cuando quieras en Configuración. Sirve para saber qué herramientas se usan y cuáles fallan, y así decidir qué mejorar primero. Esta es la lista completa de lo que se envía.',
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
            'Un identificador aleatorio de este navegador y otro de esta visita, que no se vinculan con tu cuenta.',
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
        { k: 'p', t: 'En Configuración, en la sección Privacidad, o en tu perfil si tenés cuenta. Si dejás de compartir, los eventos que todavía no se enviaron se descartan.' },
      ],
      faqTitle: 'Preguntas frecuentes',
      faq: [],
    },
    en: {
      title: 'What Stabileo sends when you share anonymous usage',
      description: 'The complete list of what Stabileo sends if you agree to share anonymous usage, and of what it never sends.',
      eyebrow: 'Privacy',
      lead: 'Sharing anonymous usage is optional, and you can change it at any time in Settings. It tells us which tools are used and which ones fail, so we can decide what to improve first. This is the complete list of what is sent.',
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
            'A random id for this browser and another for this visit, which are not linked to your account.',
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
        { k: 'p', t: "In Settings, under Privacy, or in your profile if you have an account. If you stop sharing, events that haven't been sent yet are discarded." },
      ],
      faqTitle: 'Frequently asked questions',
      faq: [],
    },
    pt: {
      title: 'O que o Stabileo envia quando você compartilha uso anônimo',
      description: 'A lista completa do que o Stabileo envia se você aceitar compartilhar uso anônimo, e do que ele nunca envia.',
      eyebrow: 'Privacidade',
      lead: 'Compartilhar uso anônimo é opcional, e você pode mudar isso quando quiser em Configurações. Serve para saber quais ferramentas são usadas e quais falham, e assim decidir o que melhorar primeiro. Esta é a lista completa do que é enviado.',
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
            'Um identificador aleatório deste navegador e outro desta visita, que não são vinculados à sua conta.',
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
        { k: 'p', t: 'Em Configurações, na seção Privacidade, ou no seu perfil se você tiver conta. Se você deixar de compartilhar, os eventos ainda não enviados são descartados.' },
      ],
      faqTitle: 'Perguntas frequentes',
      faq: [],
    },
  },
};
