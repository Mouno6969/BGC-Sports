// ---------------------------------------------------------------------------
// JsonLd — injects JSON-LD structured data into <head> for SEO / rich results.
// Safe for SPA: updates/replaces a named script tag on each data change.
// ---------------------------------------------------------------------------
import { useEffect } from 'react';

/**
 * @param {{ id: string, data: object | object[] | null | undefined }} props
 */
export default function JsonLd({ id = 'jsonld-default', data }) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const scriptId = `json-ld-${id}`;
    let el = document.getElementById(scriptId);

    if (!data) {
      if (el) el.remove();
      return undefined;
    }

    const json = JSON.stringify(data, null, 0);

    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = scriptId;
      el.setAttribute('data-bgc-jsonld', id);
      document.head.appendChild(el);
    }
    el.textContent = json;

    return () => {
      // Keep script on unmount only if still current — remove when component goes away
      const current = document.getElementById(scriptId);
      if (current) current.remove();
    };
  }, [id, data]);

  return null;
}
