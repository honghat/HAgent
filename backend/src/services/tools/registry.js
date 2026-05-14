import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const registry = new Map(); // name -> { name, desc, when, args, handler, label }
const EXCLUDED = new Set(['index.js', 'definitions.js', 'registry.js', 'helpers.js']);

export async function loadRegistry() {
  const files = fs.readdirSync(__dirname).filter(
    f => f.endsWith('.js') && !EXCLUDED.has(f)
  );

  for (const file of files) {
    try {
      const mod = await import(`./${file}`);
      if (mod.tool) {
        registry.set(mod.tool.name, mod.tool);
      }
    } catch (err) {
      console.error(`[Registry] Failed to load ${file}:`, err.message);
    }
  }

  console.log(`[Registry] Loaded ${registry.size} auto-registered tools`);
  return registry;
}

/**
 * Manually register a tool.
 * @param {object} toolDef 
 */
export function registerTool(toolDef) {
  registry.set(toolDef.name, toolDef);
}

export function getTool(name) {
  return registry.get(name);
}

export function getAllToolDefs() {
  return [...registry.values()].map(t => {
    // Normalize desc/description
    const desc = t.desc || t.description || '';
    
    // Normalize args/parameters
    let args = t.args || {};
    if (t.parameters?.properties) {
      args = {};
      for (const [key, prop] of Object.entries(t.parameters.properties)) {
        args[key] = prop.description || '';
      }
    }
    
    return {
      name: t.name,
      desc,
      when: t.when || '',
      args,
    };
  });
}

export function getHandler(name) {
  return registry.get(name)?.handler;
}

export function getAllLabels() {
  const labels = {};
  for (const [, t] of registry) {
    if (t.label) labels[t.name] = t.label;
  }
  return labels;
}
