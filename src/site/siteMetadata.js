const escapeAttribute = value => String(value || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function renderSiteMetadata(site) {
  const name = escapeAttribute(site.name);
  const description = escapeAttribute(site.description);
  const website = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: site.publicUrl }).replaceAll('<', String.raw`\u003c`);
  return `<meta name="description" content="${description}" />
    <meta name="application-name" content="${name}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${name}" />
    <meta property="og:site_name" content="${name}" />
    <meta property="og:description" content="${description}" />
    <script type="application/ld+json">${website}</script>`;
}
