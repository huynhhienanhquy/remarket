import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";

const tailwind = tailwindcss();

export default {
  plugins: [
    {
      ...tailwind,
      // CopilotKit v2 imports compiled Tailwind 4 CSS with native cascade layers.
      plugins: tailwind.plugins.map((transform) => (root, result) => {
        const file = root.source?.input.file?.replaceAll("\\", "/");
        if (file?.endsWith("/node_modules/@copilotkit/react-core/dist/v2/index.css")) return;
        return transform(root, result);
      }),
    },
    autoprefixer(),
  ],
};
