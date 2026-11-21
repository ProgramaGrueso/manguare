import { Camera, ImagePlus, Mic, X } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { InterfaceError, message } from '../i18n/catalog';
import { communityLabel } from '../i18n/labels';
import { useTranslation } from '../i18n/LanguageContext';
import { useSession } from '../app/SessionContext';
import { COMMUNITY_CATEGORIES, type CommunityListing } from '../lib/community';
import type {
  ListingFormController,
  ListingFormPatch,
  ListingFormValues,
  ListingValidation,
} from '../lib/voice-tools';
import { validateVoiceListing } from '../lib/voice-tools';
import { compressImage } from '../lib/photo';
import { buildListing } from '../lib/social';
import { Sheet } from './Sheet';

export const PublishListingSheet = forwardRef<ListingFormController, {
  open: boolean;
  onClose: () => void;
  onOpenVoice: () => void;
  onPublish: (listing: CommunityListing) => boolean;
}>(function PublishListingSheet({ open, onClose, onOpenVoice, onPublish }, ref) {
  const { t } = useTranslation();
  const { session } = useSession();
  const { showToast } = useApp();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('alimentos');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [coordinates, setCoordinates] = useState<ListingFormValues['coordinates']>();
  const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const getValues = (): ListingFormValues => ({
    title,
    category,
    price,
    location,
    description,
    photoAttached: Boolean(photo),
    ...(coordinates ? { coordinates } : {}),
  });

  const validateForVoice = (): ListingValidation => {
    return validateVoiceListing(getValues());
  };

  const reset = (forVoice = false) => {
    setTitle('');
    setCategory(forVoice ? '' : 'alimentos');
    setPrice('');
    setLocation('');
    setDescription('');
    setCoordinates(undefined);
    setPhoto(undefined);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = (forVoice = false): { success: boolean; message: string } => {
    if (busy) return { success: false, message: 'Espera a que termine el procesamiento de la foto.' };
    if (!title.trim()) {
      return { success: false, message: 'Falta el título de la publicación.' };
    }
    if (!category) {
      return { success: false, message: 'Selecciona una categoría para la publicación.' };
    }
    if (forVoice) {
      const validation = validateForVoice();
      if (!validation.valid) {
        return {
          success: false,
          message: `Faltan campos requeridos: ${validation.missing.join(', ')}.`,
        };
      }
    }

    const listing = buildListing({
      title,
      category,
      description,
      priceRange: price,
      location,
      author: session.name,
      community: session.community,
      coordinates,
      photo,
    });
    if (!listing) return { success: false, message: 'No se pudo crear la publicación.' };
    if (!onPublish(listing)) {
      return { success: false, message: 'No se pudo guardar la publicación en este teléfono.' };
    }
    reset();
    return { success: true, message: 'La publicación se guardó en este teléfono.' };
  };

  useImperativeHandle(
    ref,
    () => ({
      getValues,
      getPublicationSnapshot: () => JSON.stringify({ values: getValues(), photo }),
      resetForVoice: () => reset(true),
      updateFields: (patch: ListingFormPatch) => {
        const values = getValues();
        const next = { ...values };
        const limits = { title: 80, category: 20, price: 30, location: 80, description: 400 };
        for (const [field, value] of Object.entries(patch)) {
          if (!Object.prototype.hasOwnProperty.call(limits, field)) {
            return { success: false, message: `Campo no permitido: ${field}.`, values };
          }
          if (typeof value !== 'string') {
            return { success: false, message: `El campo ${field} debe ser texto.`, values };
          }
          const limit = limits[field as keyof typeof limits];
          if (limit === undefined) {
            return { success: false, message: `Campo no permitido: ${field}.`, values };
          }
          if (value.length > limit) {
            return { success: false, message: `${field} supera el máximo de ${limit} caracteres.`, values };
          }
          if (field === 'category' && value && !COMMUNITY_CATEGORIES.some((item) => item.id === value)) {
            return { success: false, message: 'La categoría no existe en el formulario.', values };
          }
          Object.assign(next, { [field]: value });
        }
        for (const [field, value] of Object.entries(patch)) {
          if (field === 'title') setTitle(value);
          else if (field === 'category') setCategory(value);
          else if (field === 'price') setPrice(value);
          else if (field === 'location') {
            setLocation(value);
            setCoordinates(undefined);
          } else if (field === 'description') setDescription(value);
        }
        return { success: true, message: 'Los campos indicados se actualizaron.', values: next };
      },
      setCoordinates: (value) => setCoordinates(value),
      validateForVoice,
      publish: () => submit(true),
    }),
    [title, category, price, location, description, coordinates, busy, photo, session, onPublish],
  );

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      setPhoto(await compressImage(file, { maxSide: 900, maxChars: 160_000 }));
    } catch (error) {
      showToast(error instanceof InterfaceError ? message(error.key) : message('network.noSePudoUsarLaFoto'), 'warn');
    } finally {
      setBusy(false);
    }
  };

  const submitManually = () => {
    const result = submit();
    if (!result.success) showToast(result.message, 'warn');
  };

  return (
    <Sheet
      open={open}
      title={t('listing.publicarMiProductoOServicio')}
      onClose={close}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || !title.trim() || !category}
          data-testid="listing-publish"
          onClick={submitManually}
        >
          {t('community.publicar')}
        </button>
      }
    >
      <div className="net-listing-form">
        <button
          type="button"
          className="btn btn-secondary btn-block"
          data-testid="listing-voice-assistant"
          onClick={onOpenVoice}
        >
          <Mic size={17} aria-hidden="true" /> {t('listing.completarConElAsistenteDeVoz')}
        </button>

        <div className="field">
          <label className="field-label" htmlFor="listing-title">
            {t('listing.titulo')}
          </label>
          <input
            id="listing-title"
            type="text"
            maxLength={80}
            value={title}
            placeholder={t('listing.ejMielPuraDeAbeja')}
            data-testid="listing-title"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="listing-category">
            {t('listing.categoria')}
          </label>
          <select
            id="listing-category"
            value={category}
            data-testid="listing-category"
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">{t('listing.seleccionaUnaCategoria')}</option>
            {COMMUNITY_CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {t(communityLabel(item.id, 'community.category.otros'))}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="listing-price">
            {t('listing.precio')}
          </label>
          <input
            id="listing-price"
            type="text"
            maxLength={30}
            value={price}
            placeholder={t('listing.ejS2030')}
            data-testid="listing-price"
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="listing-location">
            {t('listing.dondeTeEncuentran')}
          </label>
          <input
            id="listing-location"
            type="text"
            maxLength={80}
            value={location}
            placeholder={t('listing.ejChiriacoImaza')}
            data-testid="listing-location"
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="listing-description">
            {t('listing.descripcion')}
          </label>
          <textarea
            id="listing-description"
            rows={3}
            maxLength={400}
            value={description}
            data-testid="listing-description"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        {photo ? (
          <div className="net-photo-preview">
            <img src={photo} alt={t('listing.vistaPreviaDeLaFotoDelProducto')} />
            <button
              type="button"
              className="icon-btn"
              aria-label={t('network.quitarFoto')}
              onClick={() => setPhoto(undefined)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void pickPhoto(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-block"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? (
                <Camera size={18} aria-hidden="true" />
              ) : (
                <ImagePlus size={18} aria-hidden="true" />
              )}{' '}
              {busy ? t('network.procesando') : t('network.agregarFoto')}
            </button>
          </>
        )}
        <p className="field-help">
          {t('listing.tuPublicacionSeGuardaEnElTelefono')}
        </p>
      </div>
    </Sheet>
  );
});
