'use strict';

/* Dual-layer validation ("gatekeeper"):
   - syntactic: shape, types, lengths, enums, formats
   - semantic:  domain rules (uniqueness, business invariants)
   Violations return HTTP 400 with a structured payload naming the layer. */

const STATUSES = ['draft', 'active', 'archived'];
const TAG_RE = /^[a-z0-9-]{1,24}$/;

function err(field, code, message, layer) {
  return { field, code, message, layer };
}

function validateProject(input, { projects = [], selfId = null } = {}) {
  const errors = [];
  const data = input && typeof input === 'object' ? input : {};

  // ---- syntactic layer ----
  if (typeof data.name !== 'string' || !data.name.trim()) {
    errors.push(err('name', 'required', 'name is required and must be a non-empty string.', 'syntactic'));
  } else if (data.name.trim().length < 3 || data.name.trim().length > 60) {
    errors.push(err('name', 'length', 'name must be between 3 and 60 characters.', 'syntactic'));
  }

  if (data.description !== undefined &&
      (typeof data.description !== 'string' || data.description.length > 500)) {
    errors.push(err('description', 'invalid', 'description must be a string of at most 500 characters.', 'syntactic'));
  }

  if (data.status !== undefined && !STATUSES.includes(data.status)) {
    errors.push(err('status', 'enum', `status must be one of: ${STATUSES.join(', ')}.`, 'syntactic'));
  }

  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) {
      errors.push(err('tags', 'type', 'tags must be an array of strings.', 'syntactic'));
    } else {
      if (data.tags.length > 8) {
        errors.push(err('tags', 'max_items', 'a project can have at most 8 tags.', 'syntactic'));
      }
      data.tags.forEach((t, i) => {
        if (typeof t !== 'string' || !TAG_RE.test(t)) {
          errors.push(err(
            `tags[${i}]`, 'format',
            'each tag must be 1–24 chars: lowercase letters, digits or hyphens.',
            'syntactic',
          ));
        }
      });
    }
  }

  // ---- semantic layer ----
  if (typeof data.name === 'string' && data.name.trim()) {
    const wanted = data.name.trim().toLowerCase();
    const clash = projects.some((p) => p.id !== selfId && p.name.toLowerCase() === wanted);
    if (clash) {
      errors.push(err('name', 'not_unique', 'a project with this name already exists.', 'semantic'));
    }
  }

  return errors;
}

function validateKeyInput(input) {
  const errors = [];
  const data = input && typeof input === 'object' ? input : {};
  if (typeof data.name !== 'string' || data.name.trim().length < 2 || data.name.trim().length > 40) {
    errors.push(err('name', 'length', 'name must be a string between 2 and 40 characters.', 'syntactic'));
  }
  return errors;
}

function validationError(errors) {
  const layers = [...new Set(errors.map((e) => e.layer))];
  return {
    error: 'validation_failed',
    layers,
    message: `Request failed ${layers.join(' + ')} validation.`,
    details: errors,
  };
}

module.exports = { validateProject, validateKeyInput, validationError, STATUSES };
