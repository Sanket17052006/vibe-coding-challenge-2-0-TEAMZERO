import { readFile } from "node:fs/promises";
import ts from "typescript";
const urls = new Map();
export async function typeScriptURL(url) {
  if (urls.has(url.href)) return urls.get(url.href);
  let code = ts.transpileModule(await readFile(url, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const match of [...code.matchAll(/from ["'](\.[^"']+)["']/g)]) {
    const dependency = new URL(match[1] + (match[1].endsWith(".ts") ? "" : ".ts"), url);
    code = code.replace(match[0], "from " + JSON.stringify(await typeScriptURL(dependency)));
  }
  const dataURL = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  urls.set(url.href, dataURL);
  return dataURL;
}
export async function importTypeScript(url) { return import(await typeScriptURL(url)); }
