/* Wird erst geladen, wenn eine Notiz oder Karte Formeln oder Code enthält (dist/extras.js). */
import katex from "katex";
import hljs from "highlight.js/lib/core";
import java from "highlight.js/lib/languages/java";
import python from "highlight.js/lib/languages/python";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import ocaml from "highlight.js/lib/languages/ocaml";
import haskell from "highlight.js/lib/languages/haskell";
import sql from "highlight.js/lib/languages/sql";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import latex from "highlight.js/lib/languages/latex";
import x86asm from "highlight.js/lib/languages/x86asm";
import armasm from "highlight.js/lib/languages/armasm";
import mipsasm from "highlight.js/lib/languages/mipsasm";

const langs = { java, python, c, cpp, ocaml, haskell, sql, bash, javascript, typescript, json, latex, x86asm, armasm, mipsasm };
for (const [name, def] of Object.entries(langs)) hljs.registerLanguage(name, def);
hljs.registerAliases(["py"], { languageName: "python" });
hljs.registerAliases(["sh", "shell", "zsh"], { languageName: "bash" });
hljs.registerAliases(["js"], { languageName: "javascript" });
hljs.registerAliases(["ts"], { languageName: "typescript" });
hljs.registerAliases(["ml"], { languageName: "ocaml" });
hljs.registerAliases(["hs"], { languageName: "haskell" });
hljs.registerAliases(["tex"], { languageName: "latex" });
hljs.registerAliases(["asm", "nasm", "x86"], { languageName: "x86asm" });
hljs.registerAliases(["arm", "aarch64"], { languageName: "armasm" });
hljs.registerAliases(["mips", "riscv"], { languageName: "mipsasm" });

window.StudyExtras = {
  /** KaTeX als HTML (KaTeX maskiert die Eingabe; trust: false verbietet \href, \includegraphics usw.) */
  math: (tex, display) => katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", maxSize: 20, maxExpand: 500, output: "html" }),
  /** Code eingefärbt als HTML (highlight.js maskiert den Code) */
  code: (text, lang) => {
    const l = String(lang || "").toLowerCase();
    if (l && hljs.getLanguage(l)) return hljs.highlight(text, { language: l, ignoreIllegals: true }).value;
    return hljs.highlightAuto(text, ["java", "python", "c", "cpp", "ocaml", "haskell", "sql", "bash", "javascript"]).value;
  },
};
window.dispatchEvent(new Event("studyos-extras"));
