import type { TemplateSection, StructuredSchema } from '../types.js';

export function sectionsToSchema(sections: TemplateSection[]): StructuredSchema {
  const properties: StructuredSchema['properties'] = {};
  for (const s of sections) {
    properties[s.name] = {
      type: s.type === 'string' ? 'string' : 'array',
      description: s.description,
      required: s.required,
    };
  }
  return { properties };
}

export function schemaToJsonSchemaObject(schema: StructuredSchema): object {
  const props: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [name, def] of Object.entries(schema.properties)) {
    if (def.type === 'array') {
      props[name] = { type: 'array', items: { type: 'string' }, description: def.description };
    } else {
      props[name] = { type: 'string', description: def.description };
    }
    if (def.required) required.push(name);
  }

  return {
    type: 'object',
    properties: props,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}

export function normalizeSummaryResult(
  raw: unknown,
  schema: StructuredSchema
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  for (const [name, def] of Object.entries(schema.properties)) {
    const val = obj[name];
    if (def.type === 'array') {
      result[name] = Array.isArray(val) ? val.map(String) : [];
    } else {
      result[name] = typeof val === 'string' ? val : '';
    }
  }
  return result;
}
