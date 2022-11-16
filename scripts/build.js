import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import glob from "glob";
import * as HTML from "node-html-parser";
import YAML from "yaml";
import * as HTMLMinifier from "html-minifier";
import CleanCSS from "clean-css";
import JS from "uglify-js";
import chalk from "chalk";

const CSS = new CleanCSS({});

console.log(chalk.gray("Building components..."));

glob("components/*.html", async (err, files) => {
    if (err) throw err;

    const canvasComponentsJs = await fs.readFile("canvascomponents.js", "utf8");

    // load components
    let components;
    try {
        components = await Promise.all(files.map(processComponent));
    } catch (e) {
        throw new Error("Error creating components: " + e);
    }

    const serializedComponents = components
        .map((item) => `"${item.name.toLowerCase()}": ` + JSON.stringify(item))
        .join(",");
    console.log(chalk.cyan("Successfully built all components."));

    // create bookmarklet
    const fullJsStr = canvasComponentsJs.replace(
        "/*${CANVAS_COMPONENTS}*/",
        serializedComponents
    );

    const distDirectory = path.join(
        path.dirname(path.dirname(fileURLToPath(import.meta.url))),
        "dist/"
    );
    await fs.mkdir(distDirectory, { recursive: true });

    const minifiedJs = JS.minify(fullJsStr);
    if (minifiedJs.error) throw minifiedJs.error;

    const minifiedJsStr = minifiedJs.code;
    const bookmarkletJs = createBookmarklet(minifiedJsStr);
    const bookmarkletHtml = `<a href="${bookmarkletJs}" title="🍇 Canvas Components">🍇 Canvas Components</a><p>Drag the link to the left into your bookmarks bar.</p>`;

    await Promise.all([
        fs.writeFile(path.join(distDirectory, "bookmarklet"), bookmarkletJs),
        fs.writeFile(
            path.join(distDirectory, "bookmarklet.html"),
            bookmarkletHtml
        ),
        fs.writeFile(
            path.join(distDirectory, "canvascomponents.min.js"),
            minifiedJsStr
        ),
    ]);

    console.log(chalk.green("✓ Outputted bookmarklet to ./dist/bookmarklet!"));
});

const cssPropsRegex = /([\w-]+):[^;\n]+;?/g;
// prettier-ignore
const allowedCssProps = ["align-content", "align-items", "align-self", "background", "border", "border-radius", "clear", "clip", "color", "column-gap", "cursor", "direction", "display", "flex", "flex-basis", "flex-direction", "flex-flow", "flex-grow", "flex-shrink", "flex-wrap", "float", "font", "gap", "grid", "height", "justify-content", "justify-items", "justify-self", "left", "line-height", "list-style", "margin", "max-height", "max-width", "min-height", "min-width", "order", "overflow", "overflow-x", "overflow-y", "padding", "position", "place-content", "place-items", "place-self", "right", "row-gap", "text-align", "table-layout", "text-decoration", "text-indent", "top", "vertical-align", "visibility", "white-space", "width", "z-index", "zoom", "grid-area", "grid-auto-columns", "grid-auto-flow", "grid-auto-rows", "grid-column", "grid-gap", "grid-row", "grid-template", "grid-template-areas", "grid-template-columns", "grid-template-rows", "grid-column-end", "grid-column-gap", "grid-column-start", "grid-row-end", "grid-row-gap", "grid-row-start", "background-attachment", "background-color", "background-image", "background-position", "background-repeat", "background-position-x", "background-position-y", "border-bottom", "border-collapse", "border-color", "border-left", "border-right", "border-spacing", "border-style", "border-top", "border-width", "border-bottom-color", "border-bottom-style", "border-bottom-width", "border-left-color", "border-left-style", "border-left-width", "border-right-color", "border-right-style", "border-right-width", "border-top-color", "border-top-style", "border-top-width", "font-family", "font-size", "font-stretch", "font-style", "font-variant", "font-width", "list-style-image", "list-style-position", "list-style-type", "margin-bottom", "margin-left", "margin-right", "margin-top", "margin-offset", "padding-bottom", "padding-left", "padding-right", "padding-top"];

/**
 * @param {string} filename
 */
async function processComponent(filename) {
    console.log(chalk.gray(`Building ${filename}...`));
    const file = await fs.readFile(filename);
    const root = HTML.parse(file);

    const config = YAML.parse(root.querySelector("config").innerHTML);
    const css = CSS.minify(root.querySelector("style")?.innerHTML ?? "");
    for (const [_match, propName] of css.styles.matchAll(cssPropsRegex)) {
        if (!allowedCssProps.includes(propName))
            throw new Error(
                `\n\nError in ${filename}:\nCSS property '${propName}' is not supported by Canvas. It will be automatically stripped by their sanitizer.\n`
            );
    }
    if (css.errors.length > 1) throw css.errors[0];
    const style = css.styles;
    const js = JS.minify(root.querySelector("script")?.innerHTML ?? "");
    if (js.error) throw js.error;
    const script = js.code;
    const originalHtml = root.querySelector("main").innerHTML;
    // convert "transition" class to "thumbnail" class for canvas
    const transformedHtml = originalHtml.replaceAll(
        /class="(.*)transition(.*)"/g,
        (_match, cg1, cg2) => `class="${cg1 ?? ""}thumbnail${cg2 ?? ""}"`
    );
    const main = HTMLMinifier.minify(transformedHtml, {
        collapseWhitespace: true,
        removeComments: true,
    });

    return {
        ...config,
        style,
        script,
        html: main,
    };
}

/**
 * @param {string} js
 */
function createBookmarklet(js) {
    return encodeURI("javascript:!function(){" + js + "}()");
}
