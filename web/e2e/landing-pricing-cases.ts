import { test as base, expect, type Page } from '@playwright/test';
import { type Locale } from '../src/lib/i18n/offered';
import { bootLanding } from './landing-helpers';

// Landing animations have wedged the shared CI browser on subsequent contexts.
// Each case owns a browser process; retain the configured launch/context options
// and always close it, including when an assertion fails.
const test = base.extend({
  page: async ({ playwright, browserName, launchOptions, contextOptions, baseURL }, use) => {
    const browser = await playwright[browserName].launch(launchOptions);
    try {
      const context = await browser.newContext({ ...contextOptions, baseURL });
      await use(await context.newPage());
    } finally {
      await browser.close();
    }
  },
});

// Independent copy expectations: changes to the pricing policy must update this contract.
const PRICING = {
  "en": {
    "modules": [
      "Basic",
      "PRO · Analysis",
      "PRO · Code design",
      "Stabileo AI",
      "Education"
    ],
    "audiences": [
      "Firms and individuals",
      "Universities"
    ],
    "free": "Free",
    "paid": "Paid",
    "atCost": "Paid at cost",
    "intro": "The core program, for structural analysis in the browser, is open source and free for everyone. Some specialised modules are paid; universities get those modules free. Stabileo AI and heavy cloud compute are paid by everyone, universities included, priced to cover what they cost.",
    "notes": [
      "Some specialised modules are paid; universities get those modules free.",
      "Stabileo AI and heavy cloud compute are paid by everyone, universities included, priced to cover what they cost."
    ]
  },
  "es": {
    "modules": [
      "Básico",
      "PRO · Cálculo",
      "PRO · Diseño normativo",
      "Stabileo IA",
      "Educativo"
    ],
    "audiences": [
      "Empresas y particulares",
      "Universidades"
    ],
    "free": "Gratis",
    "paid": "Pago",
    "atCost": "Pago al costo",
    "intro": "El programa principal, para análisis estructural en el navegador, es de código abierto y gratuito para todos. Algunos módulos especializados son pagos; las universidades los reciben gratis. Stabileo IA y el cómputo intensivo en la nube son pagos para todos, incluidas las universidades, a un precio que cubre su costo.",
    "notes": [
      "Algunos módulos especializados son pagos; las universidades los reciben gratis.",
      "Stabileo IA y el cómputo intensivo en la nube son pagos para todos, incluidas las universidades, a un precio que cubre su costo."
    ]
  },
  "pt": {
    "modules": [
      "Básico",
      "PRO · Cálculo",
      "PRO · Projeto normativo",
      "Stabileo IA",
      "Educacional"
    ],
    "audiences": [
      "Empresas e particulares",
      "Universidades"
    ],
    "free": "Grátis",
    "paid": "Pago",
    "atCost": "Pago a preço de custo",
    "intro": "O programa principal, para análise estrutural no navegador, é de código aberto e gratuito para todos. Alguns módulos especializados são pagos; as universidades recebem esses módulos gratuitamente. O Stabileo IA e a computação intensiva na nuvem são pagos por todos, inclusive pelas universidades, a um preço que cobre seu custo.",
    "notes": [
      "Alguns módulos especializados são pagos; as universidades recebem esses módulos gratuitamente.",
      "O Stabileo IA e a computação intensiva na nuvem são pagos por todos, inclusive pelas universidades, a um preço que cobre seu custo."
    ]
  },
  "de": {
    "modules": [
      "Basis",
      "PRO · Berechnung",
      "PRO · Bemessung nach Norm",
      "Stabileo AI",
      "Lehre"
    ],
    "audiences": [
      "Unternehmen und Privatpersonen",
      "Universitäten"
    ],
    "free": "Kostenlos",
    "paid": "Kostenpflichtig",
    "atCost": "Zum Selbstkostenpreis",
    "intro": "Das Kernprogramm für die Tragwerksberechnung im Browser ist Open Source und für alle kostenlos. Einige spezialisierte Module sind kostenpflichtig; Universitäten erhalten diese Module kostenlos. Stabileo AI und rechenintensive Cloud-Berechnungen sind für alle kostenpflichtig, auch für Universitäten. Der Preis deckt die anfallenden Kosten.",
    "notes": [
      "Einige spezialisierte Module sind kostenpflichtig; Universitäten erhalten diese Module kostenlos.",
      "Stabileo AI und rechenintensive Cloud-Berechnungen sind für alle kostenpflichtig, auch für Universitäten. Der Preis deckt die anfallenden Kosten."
    ]
  },
  "fr": {
    "modules": [
      "Basique",
      "PRO · Calcul",
      "PRO · Dimensionnement réglementaire",
      "Stabileo AI",
      "Enseignement"
    ],
    "audiences": [
      "Entreprises et particuliers",
      "Universités"
    ],
    "free": "Gratuit",
    "paid": "Payant",
    "atCost": "Au prix coûtant",
    "intro": "Le programme principal, pour l’analyse de structures dans le navigateur, est open source et gratuit pour tout le monde. Certains modules spécialisés sont payants ; les universités les obtiennent gratuitement. Stabileo IA et les calculs lourds dans le cloud sont payants pour tout le monde, universités comprises, à un prix qui couvre leur coût.",
    "notes": [
      "Certains modules spécialisés sont payants ; les universités les obtiennent gratuitement.",
      "Stabileo IA et les calculs lourds dans le cloud sont payants pour tout le monde, universités comprises, à un prix qui couvre leur coût."
    ]
  },
  "tr": {
    "modules": [
      "Temel",
      "PRO · Analiz",
      "PRO · Yönetmeliğe göre tasarım",
      "Stabileo AI",
      "Eğitim"
    ],
    "audiences": [
      "Şirketler ve bireyler",
      "Üniversiteler"
    ],
    "free": "Ücretsiz",
    "paid": "Ücretli",
    "atCost": "Maliyeti karşılayan ücret",
    "intro": "Tarayıcıda yapı analizi sağlayan temel program açık kaynaklıdır ve herkes için ücretsizdir. Bazı uzmanlaşmış modüller ücretlidir; üniversiteler bu modülleri ücretsiz alır. Stabileo AI ve yoğun bulut hesaplamaları, üniversiteler dahil herkes için ücretlidir; fiyatları maliyetlerini karşılayacak şekilde belirlenir.",
    "notes": [
      "Bazı uzmanlaşmış modüller ücretlidir; üniversiteler bu modülleri ücretsiz alır.",
      "Stabileo AI ve yoğun bulut hesaplamaları, üniversiteler dahil herkes için ücretlidir; fiyatları maliyetlerini karşılayacak şekilde belirlenir."
    ]
  }
} satisfies Record<Locale, { modules: string[]; audiences: string[]; free: string; paid: string; atCost: string; intro: string; notes: string[] }>;

async function expectResponsiveNavigation(page: Page, width: number) {
  const header = page.locator('.site-header');
  const toggle = header.locator('.nav-toggle');
  await expect(toggle).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(header.locator('.nav-links')).toBeVisible();
  for (const control of await header.locator('button:visible, a:visible').all()) {
    const rect = await control.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
}

export function landingPricingTests(locale: Locale) {
  test.describe('@smoke landing pricing and responsive layout', () => {
    for (const width of [360, 390, 810]) {
      test(`pricing for both audiences in ${locale} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await bootLanding(page, { locale });
        await expectResponsiveNavigation(page, width);
        const copy = PRICING[locale];
        const pricing = page.locator('section[data-section="pricing"]');
        await pricing.scrollIntoViewIfNeeded();
        await expect(pricing).toBeVisible();
        const table = pricing.locator('.model-table');
        await expect(table.locator('thead th:not(:first-child)')).toHaveText(copy.audiences);
        const rows = await table.locator('tbody tr').evaluateAll((trs) =>
          trs.map((tr) => [...tr.querySelectorAll('th,td')].map((c) => c.textContent?.trim() ?? '')),
        );
        const prices = [
          [copy.free, copy.free],
          [copy.free, copy.free],
          [`${copy.paid}*`, copy.free],
          [`${copy.atCost}**`, `${copy.atCost}**`],
          ['', copy.free],
        ];
        expect(rows).toEqual(copy.modules.map((mod, i) => [mod, ...prices[i]]));
        await expect(pricing.locator('.lead')).toHaveText(copy.intro);
        for (const [index, note] of copy.notes.entries()) {
          await expect(pricing.locator('.mode-note').nth(index)).toHaveText(`${'*'.repeat(index + 1)} ${note}`);
        }
        // Both AI cells reference the same note; every distinct reference must resolve.
        const inTable = await table.locator('.fn').allInnerTexts();
        const inNotes = await pricing.locator('.mode-note .fn').allInnerTexts();
        expect([...new Set(inTable)].sort()).toEqual(inNotes.sort());

        // Check internal overflow too: a scrollable wrapper can hide a whole
        // audience while the document itself still fits the viewport.
        await page.evaluate(() => document.fonts.ready);
        const layout = await pricing.evaluate((section) => {
          const wrap = section.querySelector('.model-table-wrap')!;
          const cells = [...section.querySelectorAll('.model-table th, .model-table td')];
          return {
            wrapperFits: wrap.scrollWidth <= wrap.clientWidth + 1,
            cellsFit: cells.every((cell) => {
              const rect = cell.getBoundingClientRect();
              return cell.scrollWidth <= cell.clientWidth + 1 && rect.left >= 0 && rect.right <= innerWidth;
            }),
            textSizes: [...section.querySelectorAll('.model-table th, .model-table td, .lead, .mode-note')].map(
              (th) => parseFloat(getComputedStyle(th).fontSize),
            ),
          };
        });
        expect(layout.wrapperFits).toBe(true);
        expect(layout.cellsFit).toBe(true);
        for (const size of layout.textSizes) expect(size).toBeGreaterThanOrEqual(12);

        const badges = page.locator('.landing .badge-dev, .landing .eyebrow, .landing .tf-key');
        expect(await badges.count()).toBeGreaterThan(0);
        for (const badge of await badges.all()) {
          await expect(badge).toBeVisible();
          const metrics = await badge.evaluate((el) => ({
            size: parseFloat(getComputedStyle(el).fontSize),
            fits: el.scrollWidth <= el.clientWidth + 1 &&
              el.getBoundingClientRect().left >= 0 && el.getBoundingClientRect().right <= innerWidth,
          }));
          expect(metrics.size).toBeGreaterThanOrEqual(12);
          expect(metrics.fits).toBe(true);
        }
        const overflow = await page.evaluate(() => ({
          document: document.documentElement.scrollWidth,
          landing: document.querySelector('.landing')!.scrollWidth,
          viewport: innerWidth,
        }));
        expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
        expect(overflow.landing).toBeLessThanOrEqual(overflow.viewport + 1);
        await page.goto(`/${locale}/sap2000-alternative`);
        await expectResponsiveNavigation(page, width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      });
    }
  });
}
