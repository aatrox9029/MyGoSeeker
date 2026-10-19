// Small bounded XML reader for MPD manifests; never expands external entities.
export function parseXmlTree(text) {
  if (text.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Unsupported or oversized DASH XML");
  const root = { name: "root", attrs: {}, children: [], text: "" }, stack = [root];
  const decode = (value) => value.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[entity]);
  for (const token of text.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || []) {
    if (/^<\?|^<!--/.test(token)) continue;
    if (token.startsWith("</")) {
      const name = token.slice(2, -1).trim().split(":").at(-1);
      if (stack.length < 2 || stack.pop().name !== name) throw new Error("Invalid DASH XML closing tag");
    } else if (token.startsWith("<")) {
      const match = token.match(/^<([\w:-]+)/);
      if (!match) throw new Error("Invalid DASH XML element");
      const node = { name: match[1].split(":").at(-1), attrs: {}, children: [], text: "" };
      for (const attr of token.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) node.attrs[attr[1]] = decode(attr[2] ?? attr[3]);
      stack.at(-1).children.push(node);
      if (!token.endsWith("/>")) stack.push(node);
      if (stack.length > 32) throw new Error("DASH XML nesting limit exceeded");
    } else stack.at(-1).text += decode(token);
  }
  if (stack.length !== 1) throw new Error("Incomplete DASH XML");
  return root.children.find((node) => node.name === "MPD") || (() => { throw new Error("Invalid DASH MPD"); })();
}
export const xmlChild = (node, name) => node?.children.find((child) => child.name === name);
export const xmlChildren = (node, name) => node?.children.filter((child) => child.name === name) || [];
