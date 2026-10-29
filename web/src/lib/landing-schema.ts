import { PUBLIC_LOCALES, type Locale } from './i18n/offered';
import { publicUrl } from './i18n/public-routes';
import { STABILEO_ORGANIZATION, ERGODIC_GROUP, LAMBDA_CLASS } from './page-meta';

export function landingGraph(locale: Locale, description: string): object[] {
  return [
        {
          '@type': 'WebSite',
          '@id': 'https://stabileo.com/#website',
          name: 'Stabileo',
          url: 'https://stabileo.com/',
          inLanguage: locale,
          publisher: { '@id': STABILEO_ORGANIZATION['@id'] },
        },
        STABILEO_ORGANIZATION,
        {
          '@type': 'SoftwareApplication',
          '@id': 'https://stabileo.com/#software',
          name: 'Stabileo',
          description: description,
          url: publicUrl('/', locale),
          applicationCategory: 'EngineeringApplication',
          operatingSystem: 'Web, Windows, macOS, Linux',
          offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
          license: 'https://www.gnu.org/licenses/agpl-3.0.html',
          sameAs: 'https://github.com/lambdaclass/stabileo',
          inLanguage: PUBLIC_LOCALES,
          publisher: ERGODIC_GROUP,
          author: LAMBDA_CLASS,
        },
      ];
}
