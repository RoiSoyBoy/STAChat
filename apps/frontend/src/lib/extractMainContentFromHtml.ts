import * as cheerio from 'cheerio';

/**
 * Extracts the main readable content from HTML, removing nav, footer, scripts, styles, and irrelevant links.
 * @param html The raw HTML string
 * @returns Cleaned main content as plain text
 */
export function extractMainContentFromHtml(html: string): string {
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script, style, nav, footer, header, noscript, iframe, form, aside, .sidebar, .advertisement, .ads, .promo').remove();

  // Remove hidden elements
  $('[aria-hidden="true"], [style*="display:none"], [style*="visibility:hidden"]').remove();

  // Remove irrelevant links (e.g., social, login, share)
  $('a').each((_: number, el: any) => {
    const href = $(el).attr('href') || '';
    if (/login|signup|register|share|facebook|twitter|instagram|linkedin|mailto|#/.test(href)) {
      $(el).remove();
    }
  });

  // Try to get <main> content, fallback to <body>
  let mainContent = $('main').text();
  if (!mainContent || mainContent.trim().length < 100) {
    mainContent = $('body').text();
  }

  // Clean up whitespace
  mainContent = mainContent.replace(/\s+/g, ' ').trim();
  return mainContent;
} 