import * as ts from "typescript/lib/tsserverlibrary";
import { readFileSync, existsSync, watch } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, normalize, resolve } from "node:path";

function init(modules: { typescript: typeof ts }) {
  const ts = modules.typescript;

  let region = "default";

  function createRegionWatcher(regionFile: string) {
    const loadRegion = () => {
      if (existsSync(regionFile)) {
        region = readFileSync(regionFile, "utf-8").trim();
        console.log(`[ts-plugin-region-resolver] region updated: ${region}`);
      }
    };
    loadRegion();

    try {
      watch(regionFile, (eventType) => {
        if (eventType === "change") {
          loadRegion();
        }
      });
    } catch (e) {
      console.warn(
        `[ts-plugin-region-resolver] watch failed for ${regionFile}`,
        e
      );
    }
  }

  return {
    create(info: ts.server.PluginCreateInfo) {
      // 获取项目根目录
      const projectRoot = info.project.getCurrentDirectory()
      const nodeModulesRegex = new RegExp(String.raw`^${ts.server.toNormalizedPath(join(projectRoot, 'node_modules'))}/.*`, 'i')
      const regionFile = join(projectRoot, info.config.regionFile || '.region')
      createRegionWatcher(regionFile)

      console.log('[ts-plugin-region-resolver] resolveModuleName', info.languageServiceHost.resolveModuleNames)

      const oldResolveModuleNameLiterals = info.languageServiceHost.resolveModuleNameLiterals?.bind(info.languageServiceHost);
      console.log('[ts-plugin-region-resolver] nodeModulesPath', nodeModulesRegex.source)
      info.languageServiceHost.resolveModuleNameLiterals = (literals, containingFile, redirectedReference, options, ...rest) => {
        const resolvedModules = oldResolveModuleNameLiterals?.(literals, containingFile, redirectedReference, options, ...rest) ?? []
        return resolvedModules.map((mod, i) => {
          const literal = literals[i]
          const sourceName = literal.text
          const importer = ts.server.toNormalizedPath(containingFile)
          
          if (nodeModulesRegex.test(importer)) {
            return mod
          }
          
          if (!sourceName.startsWith('.') && !isAbsolute(sourceName)) {
            return mod
          }
          
          const modName = mod.resolvedModule?.resolvedFileName
            ?? resolve(dirname(containingFile), sourceName)

          if (modName) {
            const dir = dirname(modName)
            const ext = extname(modName)
            const base = basename(modName, ext)
            const tryPaths = [
              join(dir, `${base}.${region}${ext}`),
              join(dir, region, `${base}${ext}`),
            ]

            for (const tryPath of tryPaths) {
              console.log('[ts-plugin-region-resolver] tryPath', tryPath)
              if (existsSync(tryPath)) {
                console.log('[ts-plugin-region-resolver] tryPath exists')
                return {
                  resolvedModule: {
                    resolvedFileName: tryPath,
                    extension: ts.Extension.Ts
                  }
                }
              }
            }
          }
          
          return mod
        })
      }

      const oldGetQuickInfo = info.languageService.getQuickInfoAtPosition.bind(info.languageService)
      info.languageService.getQuickInfoAtPosition = (fileName, pos) => {
        const result = oldGetQuickInfo(fileName, pos)
        if (result) {
          result.displayParts = [
            { text: `[🌏 region: ${region}] `, kind: "text" },
            ...(result.displayParts ?? [])
          ]
        }

        return result
      }

      return info.languageService
    },
  };
}

export = init;
