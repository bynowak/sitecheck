import { load } from 'cheerio';
import type { Category, Finding, PageSnapshot, Severity } from './types.js';

export function inspectPage(page: PageSnapshot): Finding[] {
  const $ = load(page.html);
  const findings: Finding[] = [];
  const add = (
    id: string,
    title: string,
    category: Category,
    severity: Severity,
    ok: boolean,
    explanation: string,
    recommendation: string,
    evidence: string[],
  ) =>
    findings.push({
      id,
      title,
      category,
      severity,
      status: ok ? 'pass' : 'fail',
      explanation,
      recommendation,
      evidence: evidence.slice(0, 20),
    });
  const meta = (name: string) =>
    $(`meta[name="${name}"],meta[property="${name}"]`)
      .attr('content')
      ?.trim() ?? '';
  const presence = (
    id: string,
    title: string,
    category: Category,
    value: string,
    recommendation: string,
  ) =>
    add(
      id,
      title,
      category,
      'warning',
      !!value,
      `${title} helps browsers, crawlers, or people understand the page.`,
      recommendation,
      [value || 'Missing'],
    );
  add(
    'http-status',
    'Successful HTTP response',
    'technical',
    'error',
    page.status >= 200 && page.status < 300,
    'The main document should load successfully.',
    'Return a 2xx status for this page.',
    [String(page.status)],
  );
  const title = $('title').first().text().trim();
  const description = meta('description');
  presence(
    'title',
    'Page title',
    'seo',
    title,
    'Add a unique, descriptive title.',
  );
  add(
    'title-length',
    'Title length',
    'seo',
    'info',
    title.length >= 15 && title.length <= 60,
    '15–60 characters is an editorial heuristic, not a ranking guarantee.',
    'Keep the title concise and descriptive.',
    [`${title.length} characters`],
  );
  presence(
    'description',
    'Meta description',
    'seo',
    description,
    'Add a useful summary in meta name="description".',
  );
  add(
    'description-length',
    'Description length',
    'seo',
    'info',
    description.length >= 70 && description.length <= 160,
    '70–160 characters is a readability heuristic; snippets vary.',
    'Write a concise, page-specific summary.',
    [`${description.length} characters`],
  );
  const canonical = $('link[rel~="canonical"]').attr('href') ?? '';
  let validCanonical = false;
  try {
    validCanonical =
      !!canonical &&
      ['https:', 'http:'].includes(new URL(canonical, page.url).protocol);
  } catch {
    /* Invalid values are reported below. */
  }
  add(
    'canonical',
    'Canonical URL',
    'seo',
    'warning',
    validCanonical && $('link[rel~="canonical"]').length === 1,
    'A single canonical URL communicates the preferred page.',
    'Provide one valid canonical link.',
    [canonical || 'Missing'],
  );
  presence(
    'robots-meta',
    'Robots directives',
    'seo',
    meta('robots'),
    'Declare intentional indexing directives; absence normally permits indexing.',
  );
  for (const [id, names] of [
    ['open-graph', ['og:title', 'og:description', 'og:image', 'og:url']],
    [
      'twitter',
      ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'],
    ],
  ] as const) {
    const missing = names.filter((name) => !meta(name));
    add(
      id,
      id === 'twitter' ? 'Twitter / X metadata' : 'Open Graph metadata',
      'seo',
      'info',
      missing.length === 0,
      'Social metadata controls shared-link previews.',
      'Add the missing social metadata fields.',
      missing.length ? missing : ['All expected fields present'],
    );
  }
  presence(
    'favicon',
    'Favicon declaration',
    'technical',
    $('link[rel~="icon"]').attr('href') ?? '',
    'Declare an icon with link rel="icon".',
  );
  presence(
    'viewport',
    'Viewport metadata',
    'technical',
    meta('viewport'),
    'Add width=device-width, initial-scale=1.',
  );
  presence(
    'language',
    'Document language',
    'accessibility',
    $('html').attr('lang')?.trim() ?? '',
    'Set a valid language tag on the html element.',
  );
  const headings = $('h1,h2,h3,h4,h5,h6')
    .toArray()
    .map((el) => ({
      level: Number(el.tagName.slice(1)),
      text: $(el).text().trim(),
    }));
  const jumps = headings.filter(
    (h, i) => h.level > (i ? headings[i - 1]!.level : 0) + 1,
  );
  add(
    'heading-order',
    'Heading hierarchy',
    'structure',
    'warning',
    jumps.length === 0,
    'Heading levels should describe a coherent document outline.',
    'Start with H1 and avoid skipped heading levels.',
    jumps.map((h) => `H${h.level}: ${h.text}`),
  );
  add(
    'h1',
    'One primary heading',
    'structure',
    'warning',
    $('h1').length === 1,
    'A primary heading identifies the main topic. Multiple H1s can be valid but warrant review.',
    'Use one clear main heading where practical.',
    [`${$('h1').length} H1 elements`],
  );
  const describe = (el: Parameters<typeof $>[0]) => $.html(el).slice(0, 240);
  const named = (el: Parameters<typeof $>[0]): boolean => {
    const node = $(el);
    const refs = (node.attr('aria-labelledby') ?? '')
      .split(/\s+/)
      .filter(Boolean);
    if (
      refs.length &&
      refs.some((id) =>
        $(`[id]`)
          .toArray()
          .some((n) => $(n).attr('id') === id && !!$(n).text().trim()),
      )
    )
      return true;
    return !!(
      node.attr('aria-label')?.trim() ||
      node.text().trim() ||
      node
        .find('img[alt]')
        .toArray()
        .some((n) => !!$(n).attr('alt')?.trim()) ||
      node.attr('title')?.trim()
    );
  };
  const unnamedLinks = $('a[href]')
    .toArray()
    .filter((el) => !named(el));
  add(
    'empty-links',
    'Links have accessible names',
    'accessibility',
    'error',
    !unnamedLinks.length,
    'People need to know where each link goes.',
    'Add meaningful link text or an accessible name.',
    unnamedLinks.map(describe),
  );
  const missingAlt = $('img:not([alt])').toArray();
  add(
    'image-alt',
    'Image alternative text',
    'accessibility',
    'error',
    !missingAlt.length,
    'Images need an alt attribute; decorative images may use an empty value.',
    'Add descriptive alt text or alt="" for decorative images.',
    missingAlt.map(describe),
  );
  const buttons = $(
    'button,input[type="button"],input[type="submit"],input[type="reset"]',
  )
    .toArray()
    .filter(
      (el) =>
        !named(el) &&
        !(
          $(el).is('input') &&
          ($(el).attr('value')?.trim() ||
            ['submit', 'reset'].includes($(el).attr('type') ?? ''))
        ),
    );
  add(
    'button-name',
    'Buttons have accessible names',
    'accessibility',
    'error',
    !buttons.length,
    'A button must communicate its action.',
    'Add visible text, aria-label, or a valid aria-labelledby reference.',
    buttons.map(describe),
  );
  const controls = $(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),select,textarea',
  )
    .toArray()
    .filter((el) => {
      const node = $(el);
      const id = node.attr('id');
      const explicit =
        !!id &&
        $('label[for]')
          .toArray()
          .some((l) => $(l).attr('for') === id && !!$(l).text().trim());
      const refs = (node.attr('aria-labelledby') ?? '')
        .split(/\s+/)
        .filter(Boolean);
      return !(
        explicit ||
        node.closest('label').text().trim() ||
        node.attr('aria-label')?.trim() ||
        refs.some((ref) =>
          $('[id]')
            .toArray()
            .some((n) => $(n).attr('id') === ref && !!$(n).text().trim()),
        ) ||
        (node.attr('type') === 'image' && node.attr('alt')?.trim())
      );
    });
  add(
    'form-labels',
    'Form controls have labels',
    'accessibility',
    'error',
    !controls.length,
    'Labels identify the purpose of form inputs. Placeholder text is not a label.',
    'Associate a label or accessible name with each form control.',
    controls.map(describe),
  );
  const ids = $('[id]')
    .toArray()
    .map((el) => $(el).attr('id')!);
  const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  add(
    'duplicate-ids',
    'Unique element IDs',
    'technical',
    'warning',
    !duplicates.length,
    'Duplicate IDs can break labels, anchors, and scripts.',
    'Give each element a unique ID.',
    duplicates,
  );
  const missingLandmarks = [
    ['main', 'main,[role="main"]'],
    ['navigation', 'nav,[role="navigation"]'],
    ['header', 'body > header,[role="banner"]'],
    ['footer', 'body > footer,[role="contentinfo"]'],
  ]
    .filter(([, selector]) => !$(selector!).length)
    .map(([name]) => name!);
  add(
    'landmarks',
    'Document landmarks',
    'structure',
    'warning',
    !missingLandmarks.length,
    'Landmarks make the document easier to navigate. Some page types legitimately omit navigation or a footer.',
    'Use semantic main, nav, header, and footer elements where appropriate.',
    missingLandmarks,
  );
  const insecure = $('[src],link[href],form[action]')
    .toArray()
    .flatMap((el) =>
      ['src', 'href', 'action']
        .map((attr) => $(el).attr(attr))
        .filter((v): v is string => !!v && /^http:\/\//i.test(v)),
    );
  add(
    'insecure-resources',
    'Secure resources',
    'technical',
    'error',
    !insecure.length,
    'HTTP resources and form targets lack transport protection.',
    'Use HTTPS for resources and form submissions.',
    insecure,
  );
  const structured = $('script[type="application/ld+json"]').toArray();
  const invalid = structured.filter((el) => {
    try {
      const data: unknown = JSON.parse($(el).text());
      return !data || typeof data !== 'object';
    } catch {
      return true;
    }
  });
  add(
    'structured-data',
    'Structured data detection',
    'seo',
    'info',
    (structured.length > 0 && !invalid.length) ||
      $('[itemscope],[typeof]').length > 0,
    'Detects JSON-LD, Microdata, or RDFa; does not validate schema.org semantics.',
    'Add relevant structured data and validate it with a dedicated schema validator.',
    [`${structured.length} JSON-LD blocks; ${invalid.length} invalid blocks`],
  );
  add(
    'dom-size',
    'DOM size',
    'technical',
    'warning',
    $('*').length <= 1500,
    'Large DOMs can increase rendering and interaction costs. This is a heuristic.',
    'Reduce unnecessary wrappers and paginate large lists.',
    [`${$('*').length} elements (threshold: 1500)`],
  );
  add(
    'response-time',
    'Document response timing',
    'technical',
    'info',
    page.responseTimeMs <= 1000,
    'Observed document response time includes network and server time, not Core Web Vitals.',
    'Investigate server latency and caching if consistently slow.',
    [`${page.responseTimeMs} ms (threshold: 1000)`],
  );
  add(
    'console-errors',
    'Browser console errors',
    'technical',
    'warning',
    !page.consoleErrors?.length,
    'Runtime errors can reveal broken functionality.',
    'Fix console errors and uncaught exceptions.',
    page.consoleErrors ?? ['Skipped: enable browser inspection'],
  );
  if (page.consoleErrors === null)
    findings[findings.length - 1]!.status = 'skip';
  return findings;
}
