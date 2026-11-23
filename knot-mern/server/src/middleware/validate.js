/**
 * Validates request data against a Zod schema.
 * Parsed output is stored on req.valid[source] so handlers never read unvalidated input.
 * (Express 5 makes req.query read-only, so we do not overwrite it.)
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const input = source === 'body' ? req.body ?? {} : source === 'query' ? req.query : req.params;
    const result = schema.safeParse(input);
    if (!result.success) return next(result.error);
    req.valid = { ...(req.valid || {}), [source]: result.data };
    return next();
  };
}
