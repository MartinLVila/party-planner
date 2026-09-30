import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const UNESCAPED_HTML = "This renders unescaped HTML. Render text, or build nodes.";

const rawHtmlSinks = [
  {
    selector: "AssignmentExpression[left.property.name=/^(inner|outer)HTML$/]",
    message: UNESCAPED_HTML,
  },
  {
    selector: "CallExpression[callee.property.name=/^(insertAdjacentHTML|setHTMLUnsafe|createContextualFragment)$/]",
    message: UNESCAPED_HTML,
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^writel?n?$/]",
    message: UNESCAPED_HTML,
  },
  {
    selector: "Property[key.name='dangerouslySetInnerHTML']",
    message: UNESCAPED_HTML,
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react/no-danger": "error",
      "no-restricted-syntax": ["error", ...rawHtmlSinks],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
