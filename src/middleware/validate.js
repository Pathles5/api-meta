import { createError } from "./errorHandler.js";

function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (rules.required && (value === undefined || value === null)) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value !== undefined && value !== null) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`${field} must be of type ${rules.type}`);
        }

        if (rules.minLength && value.length < rules.minLength) {
          errors.push(
            `${field} must be at least ${rules.minLength} characters`
          );
        }

        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(
            `${field} must be at most ${rules.maxLength} characters`
          );
        }
      }
    }

    if (errors.length > 0) {
      return next(createError(400, errors.join(", ")));
    }

    next();
  };
}

export { validateBody };
