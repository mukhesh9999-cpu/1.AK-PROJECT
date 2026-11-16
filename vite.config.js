import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default {
  plugins: [{
    name: "copy-classic-app-assets",
    apply: "build",
    transformIndexHtml(html, context) {
      return context.bundle
        ? html.replace(
          "./node_modules/@zxing/browser/umd/zxing-browser.min.js",
          "./zxing-browser.min.js",
        )
        : html;
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "app.js",
        source: readFileSync(fileURLToPath(new URL("./app.js", import.meta.url))),
      });
      this.emitFile({
        type: "asset",
        fileName: "zxing-browser.min.js",
        source: readFileSync(fileURLToPath(new URL(
          "./node_modules/@zxing/browser/umd/zxing-browser.min.js",
          import.meta.url,
        ))),
      });
    },
  }],
};
