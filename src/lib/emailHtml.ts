const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Renders a plain-text email body as minimal HTML: paragraphs, line breaks, and clickable links. */
export function textToEmailHtml(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) =>
      escapeHtml(p)
        .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1">$1</a>')
        .replace(/\n/g, "<br>"),
    )
    .map((p) => `<p style="margin:0 0 14px">${p}</p>`)
    .join("\n");
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">\n${paragraphs}\n</div>`;
}
