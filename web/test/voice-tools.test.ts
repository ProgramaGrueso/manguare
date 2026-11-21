import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isExplicitPublicationConfirmation,
  summarizeVoiceListing,
  validateVoiceListing,
  voiceListingFieldSchema,
  type ListingFormValues,
} from '../src/lib/voice-tools.ts';

describe('flujo de publicación por voz', () => {
  const complete: ListingFormValues = {
    title: 'Mochila tejida',
    category: 'vestimenta',
    price: 'S/ 50',
    location: 'GPS: -5.15, -78.29',
    description: 'Mochila hecha a mano',
  };

  it('expone campos y opciones del formulario, con foto opcional', () => {
    const schema = voiceListingFieldSchema();
    assert.equal(schema.title.required, true);
    assert.equal(schema.description.required, true);
    assert.equal(schema.photo.required, false);
    assert.ok(schema.category.options.some((option) => option.id === 'vestimenta'));
  });

  it('marca los datos incompletos sin sustituirlos por valores inventados', () => {
    const validation = validateVoiceListing({ ...complete, price: '', description: '' });
    assert.deepEqual(validation.missing, ['price', 'description']);
    assert.equal(validation.valid, false);
  });

  it('resume solo los valores capturados y advierte si comparte GPS exacto', () => {
    const summary = summarizeVoiceListing({
      ...complete,
      coordinates: { lat: -5.15, lng: -78.29, accuracy: 18 },
    });
    assert.ok(summary.includes('Mochila tejida'));
    assert.ok(summary.includes('GPS exactas: -5.15, -78.29'));
    assert.ok(summary.includes('precisión aproximada 18 m'));
    assert.ok(!summary.includes('A convenir'));
    assert.ok(!summary.includes('Sin descripción'));
  });

  it('acepta confirmación explícita y rechaza cancelación o cambios pendientes', () => {
    assert.equal(isExplicitPublicationConfirmation('Sí, publica la mochila.'), true);
    assert.equal(isExplicitPublicationConfirmation('De acuerdo, hazlo por favor.'), true);
    assert.equal(isExplicitPublicationConfirmation('No, cancela.'), false);
    assert.equal(isExplicitPublicationConfirmation('Sí, pero cambia el precio.'), false);
    assert.equal(isExplicitPublicationConfirmation('Tal vez.'), false);
  });
});
